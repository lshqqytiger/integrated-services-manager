import LoginForm from "./login-form";
import { redirectIfAuthenticated } from "../lib/session";

export default async function LoginPage() {
  await redirectIfAuthenticated("/");
  return <LoginForm />;
}
