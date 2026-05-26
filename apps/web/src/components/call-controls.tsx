"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Grid3x3, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceDevice } from "@/hooks/use-voice-device";
import { cn } from "@/lib/utils";

type Direction = "outgoing" | "incoming";

interface OutgoingProps {
  direction: "outgoing";
  userGuid: string;
  to: string;
  displayName?: string;
  onEnded: () => void;
}

interface IncomingProps {
  direction: "incoming";
  userGuid: string;
  onEnded: () => void;
  onAccept?: () => void;
}

type Props = OutgoingProps | IncomingProps;

type CallState = "connecting" | "ringing" | "active" | "ended";

const KEYPAD: ReadonlyArray<readonly [string, string]> = [
  ["1", ""],     ["2", "ABC"],  ["3", "DEF"],
  ["4", "GHI"],  ["5", "JKL"],  ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"],  ["9", "WXYZ"],
  ["*", ""],     ["0", "+"],    ["#", ""],
];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function CallControls(props: Readonly<Props>) {
  const direction: Direction = props.direction;
  const { userGuid, onEnded } = props;
  const outgoingTo = props.direction === "outgoing" ? props.to : undefined;
  const outgoingDisplayName =
    props.direction === "outgoing" ? props.displayName : undefined;
  const onAccept = props.direction === "incoming" ? props.onAccept : undefined;

  const {
    call, ready, setupError,
    makeCall, answer, reject, endCall, setMuted, sendDigits, cycleSpeaker,
  } = useVoiceDevice(userGuid);

  // Initial state differs by direction. Outgoing starts "connecting" and
  // the dial effect fires immediately. Incoming starts "ringing" and
  // waits for the user to Answer/Reject.
  const [state, setState] = useState<CallState>(
    direction === "outgoing" ? "connecting" : "ringing",
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmfBuffer, setDtmfBuffer] = useState("");
  const hadCall = useRef(false);
  const dialStarted = useRef(false);

  // Outgoing only: kick the dial once the device is ready. The dial latch
  // is in the device singleton (makeCall dedupes), so calling freely here
  // is safe; this ref just prevents double-invoking under Strict Mode's
  // dev double-mount.
  useEffect(() => {
    if (direction !== "outgoing" || !outgoingTo) return;
    if (!ready || dialStarted.current) return;
    if (call) {
      dialStarted.current = true;
      return;
    }
    dialStarted.current = true;
    makeCall({ userGuid, To: outgoingTo, destinationType: "phone" }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setState("ended");
      onEnded();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, ready, call, makeCall, userGuid, outgoingTo]);

  // Track call lifecycle events. `hadCall` flips to true once we observe
  // a Call object; only then does `call === null` mean the call ended.
  useEffect(() => {
    if (!call) {
      if (hadCall.current && state !== "ended") {
        setState("ended");
        onEnded();
      }
      return;
    }
    hadCall.current = true;
    const onAcceptEvt = () => {
      setStartedAt(Date.now());
      setState("active");
    };
    const onDisconnect = () => {
      setState("ended");
      onEnded();
    };
    call.on("accept", onAcceptEvt);
    call.on("disconnect", onDisconnect);
    return () => {
      call.off("accept", onAcceptEvt);
      call.off("disconnect", onDisconnect);
    };
  }, [call, state, onEnded]);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  async function toggleSpeaker() {
    try {
      await cycleSpeaker();
    } catch (err) {
      console.error("[CallControls] cycleSpeaker failed:", err);
    }
    setSpeakerOn((v) => !v);
  }

  async function handleHangup() {
    try {
      await endCall();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to hang up");
    }
  }

  async function handleAnswer() {
    try {
      await answer();
      onAccept?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to answer");
    }
  }

  async function handleReject() {
    try {
      await reject();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    }
  }

  function handleDigit(digit: string) {
    sendDigits(digit);
    setDtmfBuffer((b) => (b + digit).slice(-16));
  }

  if (setupError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-destructive">{setupError.message}</p>
      </div>
    );
  }

  // Resolve label/headline from the active call when it's incoming;
  // from props when outgoing.
  const fromLabel = call?.parameters["From"];
  const headline =
    direction === "outgoing"
      ? (outgoingDisplayName ?? outgoingTo ?? "")
      : (fromLabel ?? "Incoming call");
  const subline =
    direction === "outgoing" && outgoingDisplayName ? outgoingTo : undefined;

  const statusText =
    state === "connecting" ? "Connecting…" :
    state === "ringing" ? "Ringing" :
    state === "active" ? "Connected" :
    "Call ended";

  const showRingingActions = direction === "incoming" && state === "ringing";

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Identity + status + timer */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{statusText}</p>
        <h1 className="text-2xl font-semibold">{headline}</h1>
        {subline && <p className="text-sm text-muted-foreground">{subline}</p>}
        {state === "active" && (
          <p className="mt-2 font-mono text-xl tabular-nums text-muted-foreground">
            {formatDuration(elapsed)}
          </p>
        )}
      </div>

      {/* While ringing (incoming), show Answer + Reject and nothing else.
          Once accepted, the standard in-call controls take over. */}
      {showRingingActions ? (
        <div
          className="grid grid-cols-2 gap-4 border-t px-6 py-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            variant="destructive"
            size="lg"
            onClick={handleReject}
            className="h-14 w-full gap-2 rounded-full text-base"
          >
            <PhoneOff className="h-5 w-5" />
            Reject
          </Button>
          <Button
            size="lg"
            onClick={handleAnswer}
            className="h-14 w-full gap-2 rounded-full bg-green-600 text-base text-white hover:bg-green-700"
          >
            <Phone className="h-5 w-5" />
            Answer
          </Button>
        </div>
      ) : (
        <>
          {/* Control row */}
          <div className="flex items-center justify-around border-t px-6 py-4">
            <ControlButton
              icon={speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
              label="Speaker"
              onClick={toggleSpeaker}
              active={!speakerOn}
            />
            <ControlButton
              icon={<Grid3x3 className="h-6 w-6" />}
              label="Keypad"
              onClick={() => setKeypadOpen(true)}
              disabled={state !== "active"}
              active={keypadOpen}
            />
            <ControlButton
              icon={muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              label={muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
              disabled={state !== "active"}
              active={muted}
            />
          </div>
          {/* End Call — full-width red */}
          <div
            className="border-t px-6 py-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <Button
              variant="destructive"
              size="lg"
              onClick={handleHangup}
              disabled={state === "ended"}
              className="h-14 w-full gap-2 rounded-full text-base"
            >
              <PhoneOff className="h-5 w-5" />
              End Call
            </Button>
          </div>
        </>
      )}

      {/* Bottom-sheet DTMF keypad */}
      {keypadOpen && (
        <>
          <div
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setKeypadOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Dial keypad"
            className="absolute inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-background shadow-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-mono text-lg tabular-nums">{dtmfBuffer || " "}</span>
              <button
                type="button"
                onClick={() => setKeypadOpen(false)}
                aria-label="Close keypad"
                className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4">
              {KEYPAD.map(([digit, letters]) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigit(digit)}
                  disabled={state !== "active"}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center rounded-xl border bg-background",
                    "transition-colors hover:bg-accent active:bg-accent/80",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  <span className="text-2xl font-medium">{digit}</span>
                  {letters && (
                    <span className="text-[10px] tracking-widest text-muted-foreground">{letters}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function ControlButton({ icon, label, onClick, disabled, active }: Readonly<ControlButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-20 flex-col items-center justify-center gap-1 rounded-lg p-2",
        "transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
