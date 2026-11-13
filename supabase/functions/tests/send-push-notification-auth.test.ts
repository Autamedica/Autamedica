import { assertEquals } from "jsr:@std/assert"
import { isAuthorizedPushRequest } from "../send-push-notification/authorization.ts"

const secrets = {
  serviceRoleKey: "server-service-role-key",
  cronSecret: "internal-cron-token",
  dispatchSecret: "shared-dispatch-secret",
  anonKey: "public-anon-key",
}

Deno.test("push auth: unauthenticated dispatch payload must not bypass auth", () => {
  assertEquals(isAuthorizedPushRequest(null, secrets), false)
  assertEquals(isAuthorizedPushRequest("Bearer ", secrets), false)
  assertEquals(isAuthorizedPushRequest("Bearer public-anon-key", secrets), false)
  assertEquals(isAuthorizedPushRequest("Bearer patient-jwt", secrets), false)
  assertEquals(isAuthorizedPushRequest("Basic shared-dispatch-secret", secrets), false)
})

Deno.test("push auth: trusted internal credential works", () => {
  assertEquals(isAuthorizedPushRequest("Bearer server-service-role-key", secrets), true)
  assertEquals(isAuthorizedPushRequest("Bearer internal-cron-token", secrets), true)
  assertEquals(isAuthorizedPushRequest("Bearer shared-dispatch-secret", secrets), true)
  assertEquals(isAuthorizedPushRequest("bearer shared-dispatch-secret", secrets), true)
})

Deno.test("push auth: an empty/misconfigured or public-equivalent secret is never trusted", () => {
  assertEquals(isAuthorizedPushRequest("Bearer empty", { anonKey: "anything" }), false)
  assertEquals(isAuthorizedPushRequest("Bearer public-anon-key", {
    anonKey: "public-anon-key", dispatchSecret: "public-anon-key",
  }), false)
})
