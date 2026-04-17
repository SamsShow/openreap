"use client";

import { useState, useEffect } from "react";
import { PublicNav } from "./PublicNav";
import { DashNav } from "./DashNav";

export function SmartNav() {
  const [user, setUser] = useState<{
    display_name: string | null;
    email: string;
  } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/user/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser({
            display_name: data.user.display_name,
            email: data.user.email,
          });
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;

  if (user) return <DashNav user={user} />;
  return <PublicNav />;
}
