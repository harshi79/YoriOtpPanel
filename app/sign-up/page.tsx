import { redirect } from "next/navigation";

export default function SignUpPage() {
  // New accounts are created through Google OAuth on the same sign-in page.
  redirect("/sign-in");
}
