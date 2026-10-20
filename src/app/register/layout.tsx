import { redirectSignedInUser } from "@/server/auth/login-entry";

export const dynamic = "force-dynamic";

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  await redirectSignedInUser();
  return children;
}
