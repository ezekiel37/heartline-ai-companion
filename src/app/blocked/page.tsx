import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function BlockedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Sorry, {APP_NAME} is for adults only</h1>
      <p className="text-muted">
        You need to be 18 or older to use this app, so this account has been closed. If you think this is a mistake,
        contact support.
      </p>
      <Link href="/" className="btn-ghost mx-auto">
        Home
      </Link>
    </main>
  );
}
