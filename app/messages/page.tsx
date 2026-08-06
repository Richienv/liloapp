"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Send, AlertTriangle, X, Copy, Check, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { createClient } from "@/utils/supabase/client";
import { getConversations, getMessages, sendMessage } from '@/services/message-service';
import { formatMessageTime, formatMessageDate, formatLastMessageTime } from '@/utils/date-format';
import { toast } from "sonner";
import { Toaster } from 'sonner';
import { AddressButton } from "@/components/ui/address-button";
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

interface StreamerProfile {
  id: number;
  first_name: string;
  last_name: string;
  image_url: string;
  user_id: string;
  location: string;
  price: number;
  full_address: string;
}

interface ClientProfile {
  id: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string;
}

interface Conversation {
  id: string;
  streamer_id: number;
  client_id: string;
  created_at: string;
  streamer?: StreamerProfile;
  client?: ClientProfile;
  messages?: Message[];
  lastMessage?: Message;
}

// Add formatName helper function
const formatName = (firstName: string, lastName: string): string => {
  return `${firstName} ${lastName.charAt(0)}.`;
};

/**
 * The composer field, and the one place a message is typed.
 *
 * The shadcn `Input` is still written against Tailwind's own scale; `cn` knows
 * both scales, so this className replaces `text-sm`/`rounded-md`/`border-input`
 * rather than racing them in the stylesheet.
 */
const COMPOSER_FIELD =
  "h-11 min-w-0 flex-1 rounded-field border-hairline-input bg-surface text-ui text-ink placeholder:text-ink-ghost";

/**
 * A modal shell: hairline frame on the surface, over an ink scrim.
 *
 * The scrim is `bg-ink/45` rather than `black/70` + `backdrop-blur` — the blur
 * was doing the work a frame and a radius should do, and pure black over a warm
 * canvas goes visibly cold at the edges of the card.
 */
const SCRIM = "fixed inset-0 z-[var(--z-modal)] bg-ink/45";
const MODAL_FRAME =
  "w-full overflow-hidden rounded-frame border border-hairline bg-surface";

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobileChat, setIsMobileChat] = useState(false);
  const [userType, setUserType] = useState<'streamer' | 'client' | null>(null);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const initializeChat = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/sign-in');
        return;
      }

      // Get user type
      const { data: userData } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', user.id)
        .single();

      if (userData) {
        setUserType(userData.user_type as 'streamer' | 'client');
      }

      setCurrentUser(user);

      try {
        let conversationsData;

        if (userData?.user_type === 'client') {
          // Fetch conversations for client
          const { data } = await supabase
            .from('conversations')
            .select(`
              *,
              streamer:streamers (
                id, first_name, last_name, image_url, user_id, location, price, full_address
              ),
              messages (
                id, content, created_at, sender_id, conversation_id
              )
            `)
            .eq('client_id', user.id)
            .order('created_at', { ascending: false });
          
          conversationsData = data;
        } else if (userData?.user_type === 'streamer') {
          // First get the streamer's ID
          const { data: streamerData } = await supabase
            .from('streamers')
            .select('id, full_address')
            .eq('user_id', user.id)
            .single();

          if (streamerData) {
            // Fetch conversations for streamer
            const { data } = await supabase
              .from('conversations')
              .select(`
                *,
                client:users!conversations_client_id_fkey (
                  id, first_name, last_name, profile_picture_url
                ),
                messages (
                  id, content, created_at, sender_id, conversation_id
                )
              `)
              .eq('streamer_id', streamerData.id)
              .order('created_at', { ascending: false });
            
            conversationsData = data;
          }
        }

        if (conversationsData) {
          const processedConversations = conversationsData.map((conv: any) => ({
            ...conv,
            lastMessage: conv.messages && conv.messages.length > 0 
              ? conv.messages.sort((a: Message, b: Message) => 
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )[0]
              : null
          }));

          console.log('Processed conversations:', processedConversations);
          setConversations(processedConversations);
          
          if (processedConversations.length > 0) {
            setSelectedConversation(processedConversations[0]);
            const messagesData = await getMessages(processedConversations[0].id);
            setMessages(messagesData || []);
          }
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
        toast.error('Gagal memuat percakapan');
      }
    };

    initializeChat();
  }, [router]);

  useEffect(() => {
    // Scroll to bottom when messages update
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * The block on sharing personal details.
   *
   * It was a red circle over a red panel over a red button — three weights of
   * the same alarm, so none of them ranked. One caution-toned line carries the
   * consequence and the dismiss button stays quiet: the reader is not being
   * asked to choose anything, only to have read it.
   */
  const WarningModal = () => {
    return (
      <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
        <div className={SCRIM} />

        <div className={`${MODAL_FRAME} relative max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300`}>
          <div className="flex items-start gap-3 border-b border-hairline-soft px-5 py-4 sm:px-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
            <h3 className="min-w-0 font-serif text-title font-semibold text-ink">
              Peringatan keamanan
            </h3>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <p className="text-copy text-ink-body">
              Untuk melindungi kamu dan host dari penipuan, informasi pribadi tidak bisa dibagikan di platform Salda.
            </p>
            <p className="rounded-panel border border-caution-line bg-caution-tint px-4 py-3 text-meta text-caution">
              Pelanggaran berulang terhadap kebijakan ini dapat mengakibatkan pemblokiran akun secara permanen.
            </p>
            <p className="text-meta text-ink-soft">
              Butuh bantuan? Hubungi{" "}
              <a
                href="mailto:admin@trollife.id"
                className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
              >
                admin@trollife.id
              </a>
              .
            </p>
          </div>

          <div className="border-t border-hairline-soft bg-surface-tint px-5 py-4 sm:px-6">
            <Button variant="quiet" size="action-full" onClick={() => toast.dismiss()}>
              Saya mengerti
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const ShippingInquiryModal = () => {
    return (
      <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
        <div className={SCRIM} />

        <div className={`${MODAL_FRAME} relative max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300`}>
          <div className="border-b border-hairline-soft px-5 py-4 sm:px-6">
            <h3 className="font-serif text-title font-semibold text-ink">
              Pengiriman barang
            </h3>
          </div>

          <div className="space-y-3 px-5 py-5 sm:px-6">
            <p className="text-copy text-ink-body">
              Kamu ingin mengirim barang ke host? Hubungi admin Salda untuk mengatur pengiriman produk yang mau kamu tampilkan.
            </p>
            <a
              href="https://wa.me/62895700120901"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-copy font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
            >
              Hubungi admin
            </a>
          </div>

          <div className="border-t border-hairline-soft bg-surface-tint px-5 py-4 sm:px-6">
            <Button variant="quiet" size="action-full" onClick={() => toast.dismiss()}>
              Tutup
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const InlineNotification = () => {
    return (
      <div className="mb-3 flex justify-center">
        <p className="max-w-[90%] rounded-panel border border-hairline bg-surface px-4 py-3 text-meta text-ink-muted">
          Kamu ingin mengirim barang ke host? Hubungi admin kami.{" "}
          <a
            href="https://wa.me/62895700120901"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline decoration-hairline-strong underline-offset-2 transition-colors hover:decoration-ink"
          >
            Klik di sini
          </a>
          .
        </p>
      </div>
    );
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !currentUser) return;

    try {
      await sendMessage({
        conversation_id: selectedConversation.id,
        sender_id: currentUser.id,
        content: newMessage.trim()
      });

      setNewMessage('');
      
      // Refresh messages
      const messagesData = await getMessages(selectedConversation.id);
      setMessages(messagesData || []);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "FORBIDDEN_CONTENT") {
          toast.custom((t) => <WarningModal />, {
            duration: Infinity,
            position: "top-center",
          });
        } else {
          console.error('Error sending message:', error);
          toast.error("Gagal mengirim pesan. Silakan coba lagi.");
        }
      }
    }
  };

  const markMessagesAsRead = async (conversationId: string) => {
    if (!currentUser?.id) {
      console.error('Cannot mark messages as read: currentUser is not defined');
      return;
    }

    const supabase = createClient();
    try {
      console.log('Marking messages as read for conversation:', conversationId);
      
      // Update all unread messages in this conversation
      const { data, error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('is_read', false)
        .select();

      if (error) {
        console.error('Error marking messages as read:', error);
        throw error;
      }

      // Refresh messages to update UI
      const messagesData = await getMessages(conversationId);
      setMessages(messagesData || []);

      console.log('Messages marked as read:', data);
    } catch (error) {
      console.error('Error marking messages as read:', error);
      toast.error("Gagal menandai pesan sebagai telah dibaca");
    }
  };

  const handleConversationSelect = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setIsMobileChat(true);
    try {
      const messagesData = await getMessages(conversation.id);
      setMessages(messagesData || []);
      // Mark messages as read when conversation is selected
      await markMessagesAsRead(conversation.id);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const renderMessages = () => {
    let currentDate = '';
    
    return messages.map((message, index) => {
      const messageDate = formatMessageDate(message.created_at);
      let showDateSeparator = false;
      
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        showDateSeparator = true;
      }

      const isCurrentUser = message.sender_id === currentUser?.id;

      return (
        <div key={message.id}>
          {showDateSeparator && (
            <div className="my-4 flex justify-center">
              <span className="rounded-chip border border-hairline bg-surface px-2.5 py-1 font-mono text-tiny uppercase text-ink-ghost">
                {messageDate}
              </span>
            </div>
          )}
          {/*
            Two quiet fills, not one saturated one. A solid blue bubble made the
            reader's own messages the loudest thing on a screen whose one accent
            belongs to the send button; the tint separates the two speakers just
            as well and leaves the text at full ink contrast.
          */}
          <div className={`mb-2.5 flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-panel px-3.5 py-2.5 sm:max-w-[70%] ${
                isCurrentUser ? 'bg-brand-tint text-ink' : 'bg-surface-tint text-ink-body'
              }`}
            >
              <p className="whitespace-pre-line break-words text-copy">{message.content}</p>
              <div className="mt-1 flex items-center justify-end gap-1">
                <time className="numeric text-mini text-ink-faint">
                  {formatMessageTime(message.created_at)}
                </time>
                {isCurrentUser && (
                  <span
                    aria-label={message.is_read ? 'Sudah dibaca' : 'Terkirim'}
                    className={message.is_read ? 'text-ink-soft' : 'text-ink-ghost'}
                  >
                    {message.is_read ? (
                      <CheckCheck className="h-3 w-3" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  // Update the real-time subscription
  useEffect(() => {
    if (!selectedConversation) return;

    const supabase = createClient();
    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel(`messages:${selectedConversation.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversation.id}`
          },
          async (payload: RealtimePostgresChangesPayload<Message>) => {
            // Refresh messages when there are changes
            const messagesData = await getMessages(selectedConversation.id);
            setMessages(messagesData || []);

            // If the message is from the other user, mark it as read
            const newMessage = payload.new as Message;
            if (newMessage && newMessage.sender_id !== currentUser?.id) {
              await markMessagesAsRead(selectedConversation.id);
            }
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedConversation, currentUser]);

  /**
   * One conversation, one line.
   *
   * The name block is `min-w-0` + `truncate` and the timestamp is `shrink-0`,
   * so a long name shortens itself instead of pushing the time onto a second
   * row. A list where some rows are two lines tall and some are three is a list
   * you cannot scan.
   */
  const renderConversationList = () => (
    conversations.map((conversation) => (
      <div
        key={conversation.id}
        className={`flex min-w-0 cursor-pointer items-center gap-3 border-b border-hairline-soft px-4 py-3.5 transition-colors hover:bg-surface-raised ${
          selectedConversation?.id === conversation.id ? 'bg-surface-tint' : ''
        }`}
        onClick={() => handleConversationSelect(conversation)}
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-tint">
          <Image
            src={userType === 'client'
              ? (conversation.streamer?.image_url || '/default-avatar.png')
              : (conversation.client?.profile_picture_url || '/default-avatar.png')
            }
            alt={userType === 'client'
              ? formatName(conversation.streamer?.first_name || '', conversation.streamer?.last_name || '')
              : formatName(conversation.client?.first_name || '', conversation.client?.last_name || '')
            }
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-3">
            <h3 className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
              {userType === 'client'
                ? formatName(conversation.streamer?.first_name || '', conversation.streamer?.last_name || '')
                : formatName(conversation.client?.first_name || '', conversation.client?.last_name || '')
              }
            </h3>
            {conversation.lastMessage && (
              <span className="numeric shrink-0 text-mini text-ink-faint">
                {formatLastMessageTime(conversation.lastMessage.created_at)}
              </span>
            )}
          </div>
          <p className="truncate text-meta text-ink-soft">
            {conversation.lastMessage?.content || 'Belum ada pesan'}
          </p>
        </div>
      </div>
    ))
  );

  const handleBackNavigation = () => {
    if (isMobileChat) {
      setIsMobileChat(false);
    } else if (userType === 'streamer') {
      router.push('/streamer-dashboard');
    } else {
      router.push('/protected');
    }
  };

  const handleCopyAddress = async () => {
    if (selectedConversation?.streamer?.full_address) {
      try {
        await navigator.clipboard.writeText(selectedConversation.streamer.full_address);
        setIsCopied(true);
        toast.success("Alamat berhasil disalin!");
        
        // Reset the copied state after 2 seconds
        setTimeout(() => {
          setIsCopied(false);
        }, 2000);
      } catch (err) {
        toast.error("Gagal menyalin alamat");
      }
    }
  };

  /**
   * The host's shipping address.
   *
   * The address is the whole point of the card, so it is a hairline definition
   * list rather than three tinted wells — and the copy button is the one accent
   * in here. The copied state was a green fill; it is now the quiet half of the
   * pair, because "already done" is not an action to press again.
   */
  const DeliveryInfoCard = () => {
    const address = selectedConversation?.streamer?.full_address;

    return (
      <>
        <div className={SCRIM} onClick={() => setShowDeliveryInfo(false)} />

        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
          <div className={`${MODAL_FRAME} max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200`}>
            <div className="flex min-w-0 items-center gap-3 border-b border-hairline-soft px-5 py-4">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-panel border border-hairline bg-surface-tint">
                <Image
                  src={selectedConversation?.streamer?.image_url || '/default-avatar.png'}
                  alt="Host"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-serif text-title font-semibold text-ink">
                  {selectedConversation?.streamer?.first_name} {selectedConversation?.streamer?.last_name?.charAt(0)}.
                </h3>
                <p className="numeric truncate text-meta text-ink-soft">
                  Rp {selectedConversation?.streamer?.price?.toLocaleString('id-ID')} / jam
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryInfo(false)}
                aria-label="Tutup"
                className="-mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-field text-ink-soft transition-colors hover:bg-surface-tint hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <dl className="overflow-hidden rounded-panel border border-hairline">
                <div className="flex min-w-0 items-baseline gap-4 border-b border-hairline-soft px-4 py-3">
                  <dt className="shrink-0 text-meta text-ink-soft">ID host</dt>
                  <dd className="numeric min-w-0 flex-1 truncate text-right text-copy text-ink">
                    #{selectedConversation?.streamer?.id}
                  </dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-meta text-ink-soft">Alamat pengiriman</dt>
                  <dd className="mt-1 whitespace-pre-line text-copy text-ink-body">
                    {address || (
                      <span className="text-ink-ghost">Alamat tidak tersedia</span>
                    )}
                  </dd>
                </div>
              </dl>

              <Button
                variant={isCopied ? 'quiet' : 'brand'}
                size="action-full"
                onClick={handleCopyAddress}
                disabled={!address || isCopied}
              >
                {isCopied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Alamat sudah disalin
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Salin alamat
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen w-full flex-col bg-canvas">
      <Toaster richColors position="top-center" />

      {/*
        The bar is `bg-canvas`, not white. A white bar over a warm canvas draws a
        second horizontal edge under the hairline and reads as two headers.
      */}
      <header className="w-full shrink-0 border-b border-hairline bg-canvas">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="-ml-1 inline-flex shrink-0 items-center gap-1 text-meta text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
            Kembali
          </button>
          <h1 className="min-w-0 truncate font-serif text-title font-semibold text-ink">
            Pesan
          </h1>
        </div>
      </header>

      {/* Chat Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat List */}
        <div className={`w-full shrink-0 overflow-y-auto border-r border-hairline bg-canvas md:w-[320px] lg:w-[380px] ${isMobileChat ? 'hidden md:block' : 'block'}`}>
          {conversations.length > 0 ? renderConversationList() : (
            <div className="px-5 py-16 text-center">
              <p className="font-serif text-title font-semibold text-ink">
                Belum ada percakapan
              </p>
              <p className="mx-auto mt-2 max-w-xs text-meta text-ink-soft">
                Chat kamu dengan host akan muncul di sini setelah booking pertama.
              </p>
            </div>
          )}
        </div>

        {/* Message Thread */}
        <div className={`min-w-0 flex-1 flex-col bg-canvas ${isMobileChat ? 'flex' : 'hidden md:flex'}`}>
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="shrink-0 border-b border-hairline bg-canvas px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-tint">
                    <Image
                      src={userType === 'client'
                        ? (selectedConversation.streamer?.image_url || '/default-avatar.png')
                        : (selectedConversation.client?.profile_picture_url || '/default-avatar.png')
                      }
                      alt="Foto profil"
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
                    {userType === 'client'
                      ? formatName(selectedConversation.streamer?.first_name || '', selectedConversation.streamer?.last_name || '')
                      : formatName(selectedConversation.client?.first_name || '', selectedConversation.client?.last_name || '')
                    }
                  </span>
                  {/*
                    `shrink-0` and nothing else — the button lives in
                    components/ui/address-button.tsx and is not this page's to
                    restyle. Without it the name beside it wins the space and
                    the label wraps onto a second line.
                  */}
                  {selectedConversation?.streamer && userType === 'client' && (
                    <AddressButton
                      streamerId={selectedConversation.streamer.id}
                      clientId={selectedConversation.client_id}
                      onShowAddress={() => setShowDeliveryInfo(true)}
                      className="shrink-0"
                    />
                  )}
                </div>
              </div>

              {/*
                A caution strip, not a blue one. Blue on this screen means "the
                thing to press"; a standing warning that is never pressed and
                never goes away should not wear the same colour as the send
                button.
              */}
              <div className="flex shrink-0 items-start gap-2 border-b border-caution-line bg-caution-tint px-4 py-2.5 text-meta text-caution sm:px-5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="min-w-0 flex-1">
                  Hati-hati penipuan. Jangan memberikan data pribadi kamu kepada host.
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {renderMessages()}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="relative shrink-0 border-t border-hairline bg-surface px-4 py-3 sm:px-5">
                {showDeliveryInfo && <DeliveryInfoCard />}

                <div className="flex min-w-0 items-center gap-2.5">
                  <Input
                    type="text"
                    placeholder="Tulis pesan…"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className={COMPOSER_FIELD}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button
                    onClick={handleSendMessage}
                    variant="brand"
                    size="icon"
                    aria-label="Kirim pesan"
                    className="h-11 w-11 shrink-0 rounded-field"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-start gap-2 border-b border-caution-line bg-caution-tint px-4 py-2.5 text-meta text-caution sm:px-5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="min-w-0 flex-1">
                  Hati-hati penipuan. Jangan bertransaksi di luar Salda dan jangan memberikan data pribadi kamu — nomor HP atau alamat — kepada host. Tetap berinteraksi lewat aplikasi Salda, ya.
                </p>
              </div>
              <div className="flex flex-1 items-center justify-center px-5 py-16 text-center">
                <p className="text-copy text-ink-soft">
                  Pilih percakapan untuk mulai chat.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
