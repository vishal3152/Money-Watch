import type { SystemMessage } from "@/app/components/system-message";

/** The standard way to surface a success or error message to the user. */
export function SystemMessageBanner({ message }: { message: SystemMessage }) {
  if (message.type === "error") {
    return (
      <p className="pw-banner-error" role="alert">
        {message.text}
      </p>
    );
  }

  return (
    <p className="pw-banner-success" role="status">
      {message.text}
    </p>
  );
}
