import { describe, expect, it } from "vitest";

import {
  initialAuthState,
  resolveStableAuthState,
} from "./use-stable-auth-state";

describe("stable auth state", () => {
  it("shows loading only before the first resolved session", () => {
    expect(
      resolveStableAuthState(
        { isAuthenticated: false, isLoading: true },
        undefined,
      ),
    ).toEqual({
      isAuthenticated: false,
      isInitialLoading: true,
      lastResolved: undefined,
    });
  });

  it("keeps the sign-in screen mounted during sign-in revalidation", () => {
    expect(
      resolveStableAuthState(
        { isAuthenticated: false, isLoading: true },
        false,
      ),
    ).toEqual({
      isAuthenticated: false,
      isInitialLoading: false,
      lastResolved: false,
    });
  });

  it("keeps authenticated navigation mounted during sign-out revalidation", () => {
    expect(
      resolveStableAuthState({ isAuthenticated: false, isLoading: true }, true),
    ).toEqual({
      isAuthenticated: true,
      isInitialLoading: false,
      lastResolved: true,
    });
  });

  it("adopts the next resolved auth state", () => {
    expect(
      resolveStableAuthState(
        { isAuthenticated: false, isLoading: false },
        true,
      ),
    ).toEqual({
      isAuthenticated: false,
      isInitialLoading: false,
      lastResolved: false,
    });
  });

  it("opens signed in with a session on the device, before the server confirms it", () => {
    const state = resolveStableAuthState(
      { isAuthenticated: false, isLoading: true },
      initialAuthState(true),
    );
    expect(state).toEqual({
      isAuthenticated: true,
      isInitialLoading: false,
      lastResolved: true,
    });
    expect(
      resolveStableAuthState(
        { isAuthenticated: false, isLoading: false },
        state.lastResolved,
      ).isAuthenticated,
    ).toBe(false);
  });

  it("waits for the server without a session on the device", () => {
    expect(initialAuthState(false)).toBeUndefined();
  });
});
