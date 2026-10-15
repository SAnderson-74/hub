import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/**
 * Runs `run` once when the address asks for this command (`?do=<name>`), then drops
 * the parameter so a reload doesn't repeat it. Waits while `ready` is false, for
 * pages that need their data first.
 */
export function useCommand(name: string, run: () => void, ready = true) {
  useLinkParam(
    "do",
    (value) => {
      if (value !== name) return false;
      run();
      return true;
    },
    ready,
  );
}

/**
 * Hands the numeric id in `?<param>=12` to `open` once `ready`, then drops it. For
 * links like "/money?transaction=12" from search.
 */
export function useOpenParam(param: string, open: (id: number) => void, ready = true) {
  useLinkParam(
    param,
    (value) => {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) open(id);
      return true;
    },
    ready,
  );
}

/** Calls `handle` with the parameter's value; drops the parameter when it returns true. */
function useLinkParam(param: string, handle: (value: string) => boolean, ready: boolean) {
  const [params, setParams] = useSearchParams();
  const value = params.get(param);
  const latest = useRef(handle);
  latest.current = handle;

  useEffect(() => {
    if (value === null || !ready) return;
    if (!latest.current(value)) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(param);
        return next;
      },
      { replace: true },
    );
  }, [param, value, ready, setParams]);
}
