"""Synthetic proc/image/socket fixtures; no SDK binary, live pidfd or signal."""
import ast
import copy
import hashlib
import os
from pathlib import Path
import select
import tempfile
import unittest
from unittest.mock import patch
import crashpad_observer_v1 as c
import qemu_partial_cleanup_v5 as a


class CrashpadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.image=self.root/'sdk/crashpad_handler'
        self.image.parent.mkdir();self.image.write_bytes(b'fixed synthetic crashpad image')
        self.proc=self.root/'proc';(self.proc/'sys/kernel/random').mkdir(parents=True)
        (self.proc/'sys/kernel/random/boot_id').write_text('synthetic-boot')
        (self.proc/'net').mkdir();(self.proc/'net/unix').write_text(
            'header\n0: 2 0 0 0005 03 100\n0: 2 0 0 0005 03 101\n')
        self.anchor=self.row(1,1002,'/anchor',pgid=1)
        self.qemu=self.row(2,1,'/qemu',pgid=1)
        self.cp=self.row(5,1,str(self.image),pgid=6)
        self.rows={1:self.anchor,2:self.qemu,5:self.cp}
        for pid,fd,inode in [(5,4,'100'),(2,3,'101')]:
            base=self.proc/str(pid);(base/'fd').mkdir(parents=True);(base/'ns').mkdir()
            (base/'fd'/str(fd)).symlink_to('socket:['+inode+']')
            (base/'ns/net').symlink_to('net:[synthetic]')
        (self.proc/'5/exe').symlink_to(self.image)
        image=a.file_pin(self.image,a.time.monotonic()+10)
        self.pin={k:self.cp[k]for k in c.SCALARS}
        self.pin.update({'argvSHA256':c.argv_hash(self.cp['argv']),
            'argvCount':len(self.cp['argv']),'imagePin':image,'initialClientFD':4,
            'clientSocketInode':'100','qemuSocketFD':3,'qemuSocketInode':'101',
            'netNamespace':'net:[synthetic]','bootID':'synthetic-boot'})
        self.now=0;self.state=None;self.observers=[]
        self.patchers=[patch.object(c,'SDK_IMAGE',str(self.image)),
            patch.object(c,'SDK_SHA256',image['sha256']),patch.object(c,'SDK_BYTES',image['st_size']),
            patch.object(c.os,'pidfd_open',return_value=999),patch.object(c.select,'poll')]
        self.mocks=[p.start()for p in self.patchers];self.poll=self.mocks[-1].return_value
        self.poll.poll.return_value=[]
        realclose=os.close
        self.closepatch=patch.object(c.os,'close',side_effect=lambda fd:None if fd==999 else realclose(fd))
        self.closed=self.closepatch.start()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for o in self.observers:o.close()
        self.closepatch.stop()
        for p in reversed(self.patchers):p.stop()

    def row(self,pid,parent,exe,pgid):
        return {'pid':pid,'ticks':str(pid*10),'uid':1000,'ppid':parent,
                'pgid':pgid,'sid':pgid,'exe':exe,'state':'S','argv':[exe.encode(),b'fixed']}

    def observer(self):
        o=c.CrashpadObserver(self.pin,self.qemu,self.anchor,22,
            lambda pid:copy.deepcopy(self.rows.get(pid)),lambda pid:self.state,
            lambda path,deadline:a.file_pin(path,a.time.monotonic()+10),
            self.proc,lambda:self.now)
        self.observers.append(o);return o

    def graph(self):return copy.deepcopy(self.rows)

    def test_census_exit_evidence_is_private_and_read_only(self):
        o=self.observer();o.before_effect(self.graph());o.effect_will_be_attempted()
        observed=copy.deepcopy(self.rows[5]);self.rows.pop(5)
        self.poll.poll.return_value=[(999,select.POLLIN)]
        basic=tuple(observed[k]for k in ('pid','ticks','ppid','pgid','sid','uid'))
        self.assertTrue(o.exit_proves_absence(5,basic,observed))
        self.assertFalse(o.exit_proves_absence(999))
        self.assertFalse(o.proof()['signalAuthority'])
        self.assertTrue(o.proof()['heldExitObserved'])
        self.assertEqual(set(o.after_effect(self.graph())),{1,2})

    def test_census_exit_identity_failure_cannot_recover(self):
        o=self.observer();o.before_effect(self.graph());o.effect_will_be_attempted()
        self.poll.poll.return_value=[(999,select.POLLIN)]
        observed=copy.deepcopy(self.rows[5]);observed['ticks']='reused'
        with self.assertRaises(RuntimeError):o.exit_proves_absence(5,row=observed)
        with self.assertRaises(RuntimeError):o.exit_proves_absence(5,row=self.rows[5])

    def test_complete_initial_proof_projects_exact_only_without_mutation(self):
        o=self.observer();rows=self.graph();rows[6]=self.row(6,1,str(self.image),6)
        projected=o.before_effect(rows)
        self.assertEqual(set(projected),{1,2,6});self.assertIn(5,rows)
        self.assertFalse(o.proof()['signalAuthority'])
        self.assertNotIn('fd',o.proof())

    def test_each_live_identity_field_or_command_change_rejects(self):
        for key,value in [('ticks','999'),('uid',1001),('ppid',99),('pgid',99),('sid',99),
                         ('exe','/other/crashpad_handler'),('argv',[b'different'])]:
            with self.subTest(key=key):
                old=copy.deepcopy(self.rows[5]);self.rows[5][key]=value
                with self.assertRaises(RuntimeError):self.observer()
                self.rows[5]=old

    def test_running_same_bytes_wrong_inode_rejects(self):
        other=self.root/'other-image';other.write_bytes(self.image.read_bytes())
        link=self.proc/'5/exe';link.unlink();link.symlink_to(other)
        with self.assertRaises(RuntimeError):self.observer()

    def test_installed_image_mutation_rejects(self):
        self.image.write_bytes(b'changed synthetic image')
        with self.assertRaises(RuntimeError):self.observer()

    def test_disappeared_before_full_pin_rejects(self):
        self.rows.pop(5)
        with self.assertRaises(RuntimeError):self.observer()
        self.mocks[3].assert_not_called()

    def test_exit_ready_during_initial_pin_rejects_and_closes(self):
        self.poll.poll.return_value=[(999,select.POLLIN)]
        with self.assertRaises(RuntimeError):self.observer()
        self.assertIn(999,[call.args[0]for call in self.closed.call_args_list])

    def test_foreign_parent_and_qemu_drift_rejects(self):
        self.rows[2]['ticks']='999'
        with self.assertRaises(RuntimeError):self.observer()

    def test_endpoint_fd_change_rejects(self):
        link=self.proc/'5/fd/4';link.unlink();link.symlink_to('socket:[999]')
        with self.assertRaises(RuntimeError):self.observer()

    def test_namespace_change_rejects(self):
        link=self.proc/'5/ns/net';link.unlink();link.symlink_to('net:[other]')
        with self.assertRaises(RuntimeError):self.observer()

    def test_boot_change_rejects(self):
        (self.proc/'sys/kernel/random/boot_id').write_text('different')
        with self.assertRaises(RuntimeError):self.observer()

    def test_missing_or_wrong_seqpacket_metadata_rejects(self):
        (self.proc/'net/unix').write_text('header\n0: 2 0 0 0001 03 100\n')
        with self.assertRaises(RuntimeError):self.observer()

    def test_same_census_scheduling_flip_is_not_identity_change(self):
        o=self.observer();self.rows[5]['state']='R'
        self.assertEqual(set(o.before_effect(self.graph())),{1,2})

    def test_live_after_effect_is_retained_without_new_wait(self):
        o=self.observer();o.before_effect(self.graph());o.effect_will_be_attempted()
        self.assertEqual(set(o.after_effect(self.graph())),{1,2})
        self.assertEqual(o.proof()['retainedPID'],5);self.assertEqual(self.now,0)
        self.assertTrue(all(call.args==(0,)for call in self.poll.poll.call_args_list))

    def test_natural_exit_requires_private_held_exit_proof(self):
        o=self.observer();o.before_effect(self.graph());o.effect_will_be_attempted()
        self.rows.pop(5);self.poll.poll.return_value=[(999,select.POLLIN)]
        self.assertEqual(set(o.after_effect(self.graph())),{1,2})
        proof=o.proof();self.assertTrue(proof['heldExitObserved']);self.assertIsNone(proof['retainedPID'])

    def test_disappearance_without_held_exit_rejects(self):
        o=self.observer();o.effect_will_be_attempted();self.rows.pop(5)
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())

    def test_visible_dead_exe_or_argv_drift_is_rejected_with_held_exit(self):
        original=copy.deepcopy(self.rows[5])
        for key,value in [('exe','/changed'),('argv',[b'changed'])]:
            self.rows[5]=copy.deepcopy(original);self.poll.poll.return_value=[]
            o=self.observer();o.before_effect(self.graph());o.effect_will_be_attempted()
            self.rows[5].update(state='Z');self.rows[5][key]=value
            self.poll.poll.return_value=[(999,select.POLLIN)]
            with self.subTest(key=key),self.assertRaisesRegex(RuntimeError,'full exit identity drift'):o.after_effect(self.graph())
        self.rows[5]=original;self.poll.poll.return_value=[]

    def test_dead_reused_identity_rejects_even_if_later_absent(self):
        o=self.observer();o.effect_will_be_attempted();self.poll.poll.return_value=[(999,select.POLLIN)]
        self.rows[5].update(ticks='999',state='Z')
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())

    def test_live_census_then_missing_current_read_rejects(self):
        o=self.observer();o.effect_will_be_attempted();rows=self.graph();self.rows.pop(5)
        self.poll.poll.return_value=[(999,select.POLLIN)]
        with self.assertRaises(RuntimeError):o.after_effect(rows)

    def test_live_after_private_exit_or_escape_rejects(self):
        o=self.observer();o.effect_will_be_attempted();self.poll.poll.return_value=[(999,select.POLLIN)]
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())

    def test_failed_proof_cannot_recover_later(self):
        o=self.observer();o.effect_will_be_attempted();self.rows[5]['uid']=1001
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())
        self.rows[5]['uid']=1000
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())

    def test_ambiguous_private_poll_event_rejects(self):
        o=self.observer();o.effect_will_be_attempted();self.poll.poll.return_value=[(999,select.POLLHUP)]
        with self.assertRaises(RuntimeError):o.after_effect(self.graph())

    def test_fixed_deadline_is_not_extended(self):
        o=self.observer();o.effect_will_be_attempted();self.now=22
        with self.assertRaises(TimeoutError):o.after_effect(self.graph())
        self.assertEqual(o.deadline,22)

    def test_no_signal_launch_network_or_sleep_entrypoints(self):
        tree=ast.parse(Path(c.__file__).read_text())
        forbidden={'pidfd_send_signal','kill','killpg','Popen','run','connect','send','sleep'}
        self.assertFalse(any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)
                             and n.func.attr in forbidden for n in ast.walk(tree)))
        self.assertFalse(any(isinstance(n,ast.Import)and any(x.name in['signal','socket','subprocess']for x in n.names)for n in ast.walk(tree)))


class PeerAckTests(unittest.TestCase):
    def setUp(self):
        self.packet={'qemuPID':2,'identities':{'2':{'ticks':'20'}},
            'observationOnlyCrashpad':{'pid':5,'ticks':'50','initialClientFD':4,
              'clientSocketInode':'100','qemuSocketFD':3,'qemuSocketInode':'101','netNamespace':'net:synthetic'}}
        self.proof={'recordKind':'ACTUAL_CURRENT_UNIX_PEER_READ','observedMonotonic':99,
            'crashpadPID':5,'crashpadTicks':'50','qemuPID':2,'qemuTicks':'20',
            'crashpadFD':4,'crashpadSocketInode':'100','qemuFD':3,'qemuSocketInode':'101',
            'netNamespace':'net:synthetic','packetSha256':'packet','reciprocalSeqpacketPeersProven':True}
        self.ack={'packetSha256':'packet','crashpadPeerProof':self.proof}
    def test_exact_recent_read_only_evidence(self):self.assertIsNone(c.check_fresh_peer_ack(self.packet,self.ack,100))
    def test_stale_future_wrong_or_missing_proof_rejects(self):
        for key,value in [('observedMonotonic',80),('observedMonotonic',101),
            ('observedMonotonic',float('nan')),('recordKind','claimed'),('crashpadPID',6),
            ('crashpadTicks','999'),('qemuPID',99),('crashpadSocketInode','999'),
            ('qemuSocketInode','999'),('netNamespace','other'),('packetSha256','wrong'),
            ('reciprocalSeqpacketPeersProven',False)]:
            with self.subTest(key=key):
                old=self.proof[key];self.proof[key]=value
                with self.assertRaises(RuntimeError):c.check_fresh_peer_ack(self.packet,self.ack,100)
                self.proof[key]=old

if __name__=='__main__':unittest.main()
