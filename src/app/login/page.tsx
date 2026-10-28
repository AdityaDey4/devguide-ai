import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to DevGuide AI</CardTitle>
          <CardDescription>Use GitHub, or get a link by email.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams needs a Suspense boundary with Cache Components */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
