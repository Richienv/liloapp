"use client";

import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Navbar } from "./components/navbar";
import { ScrollProgress } from "./sections/scroll-progress";
import Hero from "./sections/hero/page";
import HostStrip from "./sections/host-strip/page";
import CaraKerja from "./sections/cara-kerja/page";
import DiDalam from "./sections/di-dalam/page";
import FAQ from "./sections/faq/page";
import Wrapup from "./sections/wrapup/page";
import Closing from "./sections/closing/page";
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
      {/*
        The page in the order the reference argues it: what it is, how it works,
        what you get, who else did it, your objections, the door.

        `Preview` and `About` are gone — they were two more "here is the product"
        blocks with no ordering between them, which is the flat structure the
        brief describes. `CaraKerja` and `DiDalam` replace them and say which
        question each one answers.
      */}
      <ScrollProgress />
      <Navbar />
      <Hero />
      {/*
        The host strip carries id="host", which the nav links to. It also holds
        the stats band. Both sit between the hero and "Cara kerja" in the design:
        you see who is available before you are told how the process works.
      */}
      <HostStrip />
      <CaraKerja />
      <DiDalam />
      <Wrapup />
      <FAQ />
      <Closing />
      <Footer />
    </main>
  );
}
