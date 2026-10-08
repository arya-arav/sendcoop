"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteCustomerAction,
  setCustomerPasswordAction,
  updateCustomerProfileAction,
} from "../actions";

type Message = { text: string; error: boolean } | null;

function Note({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.error ? "alert" : "status"}
      className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
    >
      {message.text}
    </p>
  );
}

/** Name, email and whether it's confirmed; and setting a new password. */
export function ProfileForm({
  customerId,
  initial,
}: {
  customerId: string;
  initial: { name: string; email: string; emailVerified: boolean };
}) {
  const [profile, setProfile] = useState(initial);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const run = (
    action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>,
  ) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { text: result.message ?? "Saved.", error: false }
          : { text: result.error, error: true },
      );
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Profile</h2>
        </CardTitle>
        <CardDescription>Change their details, or set a password for them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateCustomerProfileAction(customerId, profile));
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={profile.emailVerified}
              onChange={(e) => setProfile({ ...profile, emailVerified: e.target.checked })}
            />
            Email confirmed
          </label>
          <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
            Save profile
          </Button>
        </form>
        <form
          className="flex flex-wrap items-end gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setCustomerPasswordAction(customerId, password));
            setPassword("");
          }}
        >
          <div className="grid flex-1 gap-1">
            <Label htmlFor="profile-password">New password</Label>
            <Input
              id="profile-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending || password.length < 8}>
            Set password
          </Button>
        </form>
        <Note message={message} />
      </CardContent>
    </Card>
  );
}

/** Deletes the account and the workspaces only it owns, after typing its email. */
export function DeleteCustomer({ customerId, email }: { customerId: string; email: string }) {
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>
          <h2>Delete this account</h2>
        </CardTitle>
        <CardDescription>
          Removes the account, its workspaces nobody else owns, and everything in them: subscribers,
          campaigns and reports. This can&apos;t be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await deleteCustomerAction(customerId, confirm);
              if (result && !result.ok) setMessage({ text: result.error, error: true });
            });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="delete-confirm">Type {email} to confirm</Label>
            <Input
              id="delete-confirm"
              className="w-80"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
          >
            Delete account
          </Button>
        </form>
        <Note message={message} />
      </CardContent>
    </Card>
  );
}
