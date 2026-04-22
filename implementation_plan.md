# Implementation Plan: Fix Anamnesis Input Blocking

## 1. Context

Users report that the text inputs in the anamnesis form (Conversational and Wizard modes) are sometimes unresponsive or "blocked."
Initial analysis suggests a combination of:

- UI state resets during parent re-renders.
- Potential race conditions in focus management.
- Overlays that might not be clearing properly.

## 2. Proposed Changes

### A. ConversationalField.tsx (Structural Fix)

- Modify the `useEffect` that synchronizes the `value` prop with the local `text` state.
- It should only overwrite local state if the `value` change is external, not as a side effect of the user typing.
- Ensure the `textarea` and `input` elements have consistent focus management.

### B. ConversationalAnamnesis.tsx (State Management)

- Add debug logging to trace `phase`, `aiLoading`, and `saving` states.
- Verify that `showAnalyzing` and `showVoiceCheckpoint` overlays are strictly managed.
- Ensure that the transition between Phase 1 (Chief Complaint) and Phase 3 (Structured) doesn't leave any "ghost" focus traps.

### C. AnamnesisPage.tsx (Container Fix)

- Add debug logging for `pageView`, `editMode`, and `anamnesis.locked`.
- Verify the `locked` view trigger logic to ensure it doesn't fire for active users.

## 3. Detailed Action Items

1.  **Instrumenting Logs:**
    - Add `logger.debug` calls in `AnamnesisPage` and `ConversationalAnamnesis`.
2.  **Fixing the Input Reset Bug:**
    - Update `ConversationalField.tsx` to handle `value` updates more intelligently.
3.  **Cleanup Verification:**
    - Explicitly check `VoiceAnamnesis` teardown.

## 4. Risks & Mitigations

- **Risk:** Breaking the "Optimistic UI" updates.
- **Mitigation:** Ensure that `onSubmit` still clears the field or moves to the next one correctly.
