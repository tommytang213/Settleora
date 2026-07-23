#!/usr/bin/env node
import { acquireRuntimeDeploymentLockSerialized } from "./runtime-bundle.mjs";

const [destination, encodedIdentity] = process.argv.slice(2);
if (!destination || !encodedIdentity) throw new Error("runtime deployment lock helper arguments are required");
acquireRuntimeDeploymentLockSerialized(destination, JSON.parse(encodedIdentity));
