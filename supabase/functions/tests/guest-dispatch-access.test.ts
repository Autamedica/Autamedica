import { guestDispatchCallMatches } from "../_shared/guest-dispatch-access.ts"

const dispatch = {
  id: "dispatch-1",
  call_id: "call-9",
  cloudflare_room_id: "room-abc",
  assigned_doctor_id: "doctor-7",
  status: "in_call",
}
const guest = { callId: "dispatch-1", roomId: "room-abc" }
const call = { id: "call-9", room_id: "room-abc", doctor_id: "doctor-7" }

Deno.test("pharmacy guest token resolves dispatch id to linked calls.id", () => {
  if (!guestDispatchCallMatches(dispatch, guest, call)) {
    throw new Error("accepted pharmacy dispatch did not resolve its linked call")
  }
})

Deno.test("pharmacy guest token cannot enter before dispatch is in_call", () => {
  if (guestDispatchCallMatches({ ...dispatch, status: "matched" }, guest, call)) {
    throw new Error("unconfirmed dispatch must not receive media access")
  }
})

Deno.test("pharmacy guest token cannot cross doctor, room or call bindings", () => {
  if (guestDispatchCallMatches(dispatch, guest, { ...call, doctor_id: "other-doctor" })) {
    throw new Error("cross-doctor call binding was accepted")
  }
  if (guestDispatchCallMatches(dispatch, guest, { ...call, room_id: "other-room" })) {
    throw new Error("cross-room call binding was accepted")
  }
  if (guestDispatchCallMatches(dispatch, guest, { ...call, id: "other-call" })) {
    throw new Error("cross-call binding was accepted")
  }
})

Deno.test("legacy guest callId tokens remain valid through the same linked identity", () => {
  const legacyDispatch = { ...dispatch, id: "call-9", call_id: "call-9" }
  if (!guestDispatchCallMatches(legacyDispatch, { ...guest, callId: "call-9" }, call)) {
    throw new Error("legacy callId token was rejected")
  }
})
