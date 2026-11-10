#!/usr/bin/env python3
"""Keep simulator-generated changes out of the package-capture source checkout.

This creates an exact-head detached Git worktree. It never restores dirty files,
reuses an existing destination, changes workspace allowances, or grants acceptance.
"""
from pathlib import Path
import os
import re
import subprocess
import sys

DIRECTORY = "ios-acceptance-source"


class IsolationError(Exception):
    pass


def require(condition):
    if not condition:
        raise IsolationError("ios_acceptance_source_isolation_failed")


def git(repo, *args):
    # Repository/object overrides take precedence over -C. Keep the workflow's
    # Git configuration and authentication environment, but bind operations to
    # the explicit repository argument.
    overrides = Path(__file__).resolve().with_name("git-repository-overrides.txt").read_text("ascii").splitlines()
    require(5 <= len(overrides) <= 32 and len(set(overrides)) == len(overrides)
            and {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
                 "GIT_OBJECT_DIRECTORY"} <= set(overrides)
            and all(re.fullmatch(r"GIT_[A-Z_]+", name) and not name.startswith(
                ("GIT_CONFIG", "GIT_SSH", "GIT_ASKPASS", "GIT_PROXY_COMMAND", "GIT_NO_REPLACE_OBJECTS"))
                    for name in overrides))
    env = {key: value for key, value in os.environ.items() if key not in overrides}
    result = subprocess.run(
        ["git", "--no-optional-locks", "-C", str(repo), *args],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    require(result.returncode == 0 and len(result.stdout) <= 32 * 1024 * 1024)
    return result.stdout


def roots(repo, runner_temp, source_sha):
    repo, runner_temp = Path(repo), Path(runner_temp)
    require(re.fullmatch(r"[0-9a-f]{40}", source_sha or "") is not None)
    for directory in (repo, runner_temp):
        require(directory.is_absolute() and directory.is_dir()
                and not directory.is_symlink()
                and directory.resolve(strict=True) == directory
                and directory.stat().st_uid == os.getuid())
    require(not repo.is_relative_to(runner_temp) and not runner_temp.is_relative_to(repo))
    require(git(repo, "rev-parse", "--show-toplevel").decode().strip() == str(repo))
    require(git(repo, "rev-parse", "HEAD").decode().strip() == source_sha)
    require(git(repo, "status", "--porcelain", "-z", "--untracked-files=no") == b"")
    require(git(repo, "cat-file", "-t", source_sha + ":apps/mobile").strip() == b"tree")
    return repo, runner_temp / DIRECTORY


def verify(repo, runner_temp, source_sha):
    repo, target = roots(repo, runner_temp, source_sha)
    require(target.is_dir() and not target.is_symlink()
            and target.resolve(strict=True) == target)
    require((target / ".git").is_file() and not (target / ".git").is_symlink())
    require(git(target, "rev-parse", "--show-toplevel").decode().strip() == str(target))
    require(git(target, "rev-parse", "HEAD").decode().strip() == source_sha)
    require(git(target, "branch", "--show-current").strip() == b"")
    common_args = ("rev-parse", "--path-format=absolute", "--git-common-dir")
    require(git(target, *common_args) == git(repo, *common_args))
    require((target / "apps/mobile").is_dir() and not (target / "apps/mobile").is_symlink())
    return target


def prepare(repo, runner_temp, source_sha):
    repo, target = roots(repo, runner_temp, source_sha)
    require(not target.exists() and not target.is_symlink())
    git(repo, "worktree", "add", "--detach", "--", str(target), source_sha)
    verify(repo, runner_temp, source_sha)
    require(git(target, "status", "--porcelain", "-z", "--untracked-files=no") == b"")
    return target


def main():
    require(sys.argv[1:] in ([], ["--verify"]))
    require(os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("GITHUB_JOB") == "ios-native-acceptance")
    repo = Path(os.environ.get("GITHUB_WORKSPACE", ""))
    runner_temp = Path(os.environ.get("RUNNER_TEMP", ""))
    source_sha = os.environ.get("EXPECTED_HEAD", "")
    if sys.argv[1:]:
        target = verify(repo, runner_temp, source_sha)
        require(os.environ.get("SETTLEORA_IOS_ACCEPTANCE_ROOT") == str(target))
        require(Path.cwd().resolve() == target / "apps/mobile")
    else:
        prepare(repo, runner_temp, source_sha)
    print("ios_acceptance_source_isolation=verified")


if __name__ == "__main__":
    try:
        main()
    except (IsolationError, OSError, ValueError, UnicodeError):
        sys.stderr.write("ios_acceptance_source_isolation_failed\n")
        sys.exit(98)
