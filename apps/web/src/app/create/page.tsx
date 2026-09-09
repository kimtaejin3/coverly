import { redirect } from "next/navigation";

/** The create flow moved into the workspace at `/`; keep old links and CTAs working. */
export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const query = await searchParams;
  const voice = typeof query.voice === "string" ? query.voice : null;
  redirect(voice ? `/?voice=${encodeURIComponent(voice)}` : "/");
}
