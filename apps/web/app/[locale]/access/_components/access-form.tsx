'use client';

import { useActionState } from 'react';

import { submitAccessPin } from '../_lib/access-action';

interface Props {
  next: string;
}

type State = { error?: string };

export function AccessForm({ next }: Props) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitAccessPin,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pin" className="text-[13px] font-medium text-[#1a1a1a]">
          Access code
        </label>
        <input
          id="pin"
          name="pin"
          type="text"
          autoComplete="off"
          autoFocus
          placeholder="Enter your access code"
          className="w-full rounded-xl border px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-[#FCD469]"
          style={{ borderColor: '#EAE3D2', background: '#FAFAF8' }}
        />
        {state?.error ? (
          <p className="text-[12px] font-medium text-red-600">{state.error}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl py-3 text-sm font-bold text-[#1a1a1a] transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: '#FCD469' }}
      >
        {pending ? 'Verifying…' : 'Continue'}
      </button>
    </form>
  );
}
