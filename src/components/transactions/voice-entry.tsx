"use client";

import * as React from "react";
import { Keyboard, Mic, Square } from "lucide-react";

import { TextEntry } from "@/components/transactions/text-entry";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EntryKit } from "@/lib/data/entry-kit";

/** The parts of the Web Speech API used here; browsers still prefix it. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
  stop(): void;
}
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

type Support = "checking" | "supported" | "unsupported";

function useSpeechSupport(): Support {
  return React.useSyncExternalStore<Support>(
    noopSubscribe,
    () => (recognitionConstructor() ? "supported" : "unsupported"),
    () => "checking",
  );
}

const ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone access is off for this site. Allow it in your browser’s site settings, or type below.",
  "service-not-allowed":
    "Speech recognition is turned off in this browser. You can type your entries below instead.",
  "audio-capture": "No microphone was found. You can type your entries below instead.",
  network:
    "Your browser’s speech service couldn’t be reached. Check your connection, or type below.",
  "language-not-supported": "This browser can’t recognise English (India). Type below instead.",
};

/**
 * Speak → edit the transcript → review → confirm. Listening starts only from a tap, and the
 * text box stays available throughout, so voice is never the only way in. PocketPulse receives
 * only the text; the browser's speech service may process the audio, which the page says up front.
 */
export function VoiceEntry({ kit }: { kit: EntryKit }) {
  const support = useSpeechSupport();
  const [transcript, setTranscript] = React.useState("");
  const [interim, setInterim] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const recognition = React.useRef<Recognition | null>(null);

  React.useEffect(() => () => recognition.current?.abort(), []);

  function start() {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const session = new Constructor();
    session.lang = "en-IN";
    // One phrase per tap: continuous mode repeats results on Android Chrome.
    session.continuous = false;
    session.interimResults = true;
    session.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const words = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += words;
        else interimText += words;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setTranscript((current) => [current.trim(), finalText.trim()].filter(Boolean).join(", "));
      }
    };
    session.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary endings, not failures.
      if (event.error === "no-speech")
        setError("Didn’t catch that. Tap the microphone to try again.");
      else if (event.error !== "aborted") {
        setError(ERRORS[event.error] ?? "Voice entry stopped. You can type your entries below.");
      }
    };
    session.onend = () => {
      setListening(false);
      setInterim("");
      recognition.current = null;
    };
    recognition.current = session;
    setError(null);
    setListening(true);
    try {
      session.start();
    } catch {
      setListening(false);
      recognition.current = null;
      setError("Voice entry couldn’t start. You can type your entries below.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {support === "unsupported" ? (
        <Card className="flex-row items-start gap-3" data-testid="voice-unsupported">
          <Keyboard className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">This browser can’t do voice entry</h2>
            <p className="text-sm text-muted-foreground">
              Speech recognition depends on the browser. It usually works in Chrome and Edge. You
              can type the same thing below.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="items-center gap-3 text-center">
          <Button
            type="button"
            size="lg"
            variant={listening ? "destructive" : "default"}
            className="size-20 rounded-full"
            disabled={support === "checking"}
            aria-label={listening ? "Stop listening" : "Start listening"}
            onClick={() => (listening ? recognition.current?.stop() : start())}
          >
            {listening ? (
              <Square className="size-6" aria-hidden="true" />
            ) : (
              <Mic className="size-7" aria-hidden="true" />
            )}
          </Button>
          <p className="min-h-5 text-sm" aria-live="polite" data-testid="voice-status">
            {listening ? interim || "Listening… try “tea fifteen, bus twenty”" : "Tap and speak"}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="max-w-md text-xs text-muted-foreground">
            Voice entry depends on your browser and isn’t available in all of them. Your browser
            will ask for the microphone the first time. Its speech service turns speech into text,
            and some browsers (Chrome, for example) send the audio to their maker to do that.
            PocketPulse only receives the text, and stores no audio.
          </p>
        </Card>
      )}

      <TextEntry
        kit={kit}
        source="voice"
        value={transcript}
        onChange={setTranscript}
        label={support === "unsupported" ? "What did you spend?" : "Transcript (edit if needed)"}
      />
    </div>
  );
}
