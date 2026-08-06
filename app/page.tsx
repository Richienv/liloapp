"use client";

import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Navbar } from "./components/navbar";
import Hero from "./sections/hero/page";
import About from "./sections/about/page";
import Preview from "./sections/preview/page";
import FAQ from "./sections/faq/page";
import Wrapup from "./sections/wrapup/page";
import Footer from "./sections/footer/page";
import { useRouter } from "next/navigation";

interface UserData {
  first_name: string;
  profile_picture_url: string;
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("users")
          .select("first_name, profile_picture_url")
          .eq("id", user.id)
          .single();
        setUserData(data);
      }
    };

    fetchUserData();
  }, []);

  return (
    <main className="flex w-full min-h-screen flex-col bg-canvas">
      <Navbar />
      <Hero />
      <Preview />
      <About />
      <Wrapup />
      <FAQ />
      <Footer />
    </main>
  );
}
