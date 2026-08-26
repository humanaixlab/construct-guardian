// Internal workspace sites can read the authenticated OpenAI user from the
// forwarded request headers:
//
// import { headers } from "next/headers";
//
// export default async function Home() {
//   const requestHeaders = await headers();
//   const email = requestHeaders.get("oai-authenticated-user-email");
//   const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
//   const fullName =
//     encodedFullName &&
//     requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
//       "percent-encoded-utf-8"
//       ? decodeURIComponent(encodedFullName)
//       : null;
//   const displayName = fullName ?? email;
//   // ...
// }

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f2ea] px-6 py-16 text-[#18221c]">
      <section className="w-full max-w-3xl border-l-4 border-[#d9583b] pl-7 sm:pl-10">
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-[#667068]">MVP foundation</p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-6xl">Construct Guardian</h1>
        <p className="mt-3 text-xl text-[#a34330] sm:text-2xl">Assessment Attack Agent</p>
        <p className="mt-8 max-w-xl text-base leading-7 text-[#566159]">
          The clean project foundation is ready. Product behavior and interface implementation will begin after the implementation specification is approved.
        </p>
        <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-[#c9cec8] bg-white/55 px-4 py-2 text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-[#d9583b]" aria-hidden="true" />
          Awaiting implementation specification
        </div>
      </section>
    </main>
  );
}
