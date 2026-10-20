import { redirectSignedInUser } from "@/server/auth/login-entry";

export const dynamic = "force-dynamic";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  await redirectSignedInUser();
  return children;
}
