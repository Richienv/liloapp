"use client";

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Search, Filter, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Dialog as HeadlessUIDialog } from '@headlessui/react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { Database } from '@/types/supabase'

interface BaseVoucher {
  id: string;
  code: string;
  description: string;
  discount_amount: number;
  total_quantity: number;
  remaining_quantity: number;
  is_active: boolean;
  expires_at: string;
  created_at: string;
}

interface Voucher extends BaseVoucher {}

interface VoucherUsage {
  id: string;
  voucher_id: string;
  booking_id: number;
  user_id: string;
  discount_applied: number;
  original_price: number;
  final_price: number;
  used_at: string;
  client?: {
    first_name: string;
    last_name: string;
  };
  streamer?: {
    id: number;
    first_name: string;
    last_name: string;
    image_url?: string;
  };
}

interface VoucherAnalytics {
  total_vouchers_created: number;
  total_vouchers_used: number;
  total_discount_amount: number;
  usage_ratio: number;
  top_streamers: StreamerVoucherUsage[];
  monthly_usage: MonthlyUsage[];
  usage_by_status: StatusUsage[];
}

interface StreamerVoucherUsage {
  streamer_id: number;
  first_name: string;
  last_name: string;
  image_url?: string;
  total_vouchers_used: number;
  total_discount_amount: number;
  usage_count: number;
}

interface MonthlyUsage {
  month: string;
  vouchers_used: number;
  total_discount: number;
}

interface StatusUsage {
  status: string;
  count: number;
  percentage: number;
}

interface VoucherWithAnalytics extends BaseVoucher {
  total_discount_amount: number;
  usage_count: number;
  usage_details: VoucherUsage[];
  analytics?: VoucherAnalytics;
}

// Add form validation schema
const voucherFormSchema = z.object({
  code: z.string()
    .min(6, "Code must be exactly 6 characters")
    .max(6, "Code must be exactly 6 characters")
    .regex(/^[A-Z0-9]+$/, "Only uppercase letters and numbers are allowed"),
  description: z.string()
    .min(1, "Description is required")
    .max(100, "Description must be less than 100 characters"),
  discount_amount: z.coerce.number()
    .min(1000, "Minimum discount is Rp 1,000")
    .max(10000000, "Maximum discount is Rp 10,000,000"),
  total_quantity: z.coerce.number()
    .min(1, "Minimum quantity is 1")
    .max(1000, "Maximum quantity is 1,000"),
  expires_at: z.string()
    .min(1, "Expiry date is required")
});

type FormData = z.infer<typeof voucherFormSchema>;

interface FieldRenderProps {
  field: {
    value: any;
    onChange: (value: any) => void;
    name: string;
    onBlur: () => void;
    ref: React.Ref<any>;
  };
}

// Add transition styles for hover effects and animations
const cardHoverStyle = 'transition-all duration-200 hover:shadow-lg hover:border-gray-300'
const progressBarStyle = 'transition-all duration-300 ease-in-out'
const badgeStyle = 'transition-colors duration-200'

function AnalyticsDashboard({ analytics }: { analytics: VoucherAnalytics }) {
  return (
    <div className="space-y-6 mb-8 animate-fade-in">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Operations',
            value: analytics.total_vouchers_used,
            label: 'Total vouchers redeemed',
            color: 'blue'
          },
          {
            title: 'Types',
            value: analytics.total_vouchers_created,
            label: 'Total vouchers created',
            color: 'green'
          },
          {
            title: 'Fields',
            value: `Rp ${analytics.total_discount_amount.toLocaleString()}`,
            label: 'Total discount given',
            color: 'purple'
          }
        ].map((stat, index) => (
          <div 
            key={stat.title}
            className={`bg-white rounded-xl border border-gray-200 p-6 ${cardHoverStyle}`}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-gray-900">{stat.title}</h3>
              <div className={`text-3xl font-bold text-${stat.color}-600`}>{stat.value}</div>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Usage Stats and Top Streamers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Usage Stats */}
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${cardHoverStyle}`}>
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Usage Statistics</h3>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              {/* Usage Ratio */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Usage Ratio</span>
                  <span className="text-sm text-gray-500">{Math.round(analytics.usage_ratio)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-blue-600 rounded-full ${progressBarStyle}`}
                    style={{ width: `${analytics.usage_ratio}%` }}
                  />
                </div>
              </div>

              {/* Status Distribution */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Status Distribution</h4>
                <div className="space-y-3">
                  {analytics.usage_by_status.map((status) => (
                    <div key={status.status} className="group">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600 capitalize group-hover:text-gray-900 transition-colors">
                          {status.status}
                        </span>
                        <span className="text-sm text-gray-500 group-hover:text-gray-900 transition-colors">
                          {Math.round(status.percentage)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-blue-600 rounded-full group-hover:bg-blue-700 ${progressBarStyle}`}
                          style={{ width: `${status.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Usage Chart */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Monthly Usage Trend</h4>
                <div className="space-y-2">
                  {analytics.monthly_usage.slice(0, 6).map((month) => (
                    <div key={month.month} className="group">
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-500 group-hover:text-gray-900 transition-colors">
                          {month.month}
                        </div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full bg-blue-600 rounded-full group-hover:bg-blue-700 ${progressBarStyle}`}
                            style={{ 
                              width: `${(month.vouchers_used / Math.max(...analytics.monthly_usage.map(m => m.vouchers_used))) * 100}%` 
                            }}
                          />
                        </div>
                        <div className="w-20 text-xs text-gray-500 text-right group-hover:text-gray-900 transition-colors">
                          {month.vouchers_used} used
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Top Streamers */}
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${cardHoverStyle}`}>
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Top Streamers by Usage</h3>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              {analytics.top_streamers.slice(0, 5).map((streamer, index) => (
                <div 
                  key={streamer.streamer_id} 
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-10 h-10 flex-shrink-0 relative">
                    {streamer.image_url ? (
                      <img 
                        src={streamer.image_url} 
                        alt={`${streamer.first_name} ${streamer.last_name}`}
                        className="w-full h-full rounded-full object-cover ring-2 ring-white"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
                        <span className="text-gray-500 text-sm font-medium">
                          {streamer.first_name[0]}
                        </span>
                      </div>
                    )}
                    {index < 3 && (
                      <div 
                        className={`absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold border-2 border-white ${
                          index === 0 ? 'bg-yellow-400 text-yellow-900' :
                          index === 1 ? 'bg-gray-300 text-gray-900' :
                          'bg-orange-400 text-orange-900'
                        }`}
                      >
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {streamer.first_name} {streamer.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">
                        {streamer.usage_count} vouchers used
                      </span>
                      <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700 transition-colors">
                        Rp {streamer.total_discount_amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {Math.round((streamer.usage_count / analytics.total_vouchers_used) * 100)}%
                    </div>
                    <div className="text-xs text-gray-500 group-hover:text-gray-700 transition-colors">
                      of total
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Add helper function to create default analytics
const createDefaultVoucherWithAnalytics = (voucher: Voucher): VoucherWithAnalytics => ({
  ...voucher,
  total_discount_amount: 0,
  usage_count: 0,
  usage_details: [],
  analytics: {
    total_vouchers_created: voucher.total_quantity,
    total_vouchers_used: 0,
    total_discount_amount: 0,
    usage_ratio: 0,
    top_streamers: [],
    monthly_usage: [],
    usage_by_status: []
  }
});

// Add type guard helper
const isVoucherWithAnalytics = (voucher: any): voucher is VoucherWithAnalytics => {
  return (
    voucher &&
    typeof voucher.total_discount_amount === 'number' &&
    Array.isArray(voucher.usage_details) &&
    typeof voucher.usage_count === 'number'
  );
};

// Add safe formatting helper
const formatCurrency = (amount: number | undefined): string => {
  if (typeof amount !== 'number') return 'Rp 0';
  return `Rp ${amount.toLocaleString()}`;
};

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<(Voucher | VoucherWithAnalytics)[]>([]);
  const [filteredVouchers, setFilteredVouchers] = useState<(Voucher | VoucherWithAnalytics)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherWithAnalytics | null>(null);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [globalAnalytics, setGlobalAnalytics] = useState<VoucherAnalytics | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const form = useForm<FormData>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      code: '',
      description: '',
      discount_amount: 0,
      total_quantity: 0,
      expires_at: ''
    }
  });

  useEffect(() => {
    fetchVouchers();
  }, []);

  useEffect(() => {
    filterVouchers();
  }, [searchQuery, statusFilter, vouchers]);

  const fetchVouchers = async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    
    try {
      // First get all vouchers
      const { data: vouchersData, error: vouchersError } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (vouchersError) throw vouchersError;
      
      if (!vouchersData) {
        throw new Error('No data returned from Supabase');
      }

      // Then get usage data for each voucher with streamer information
      const vouchersWithAnalytics = await Promise.all(
        vouchersData.map(async (voucher) => {
          const { data: usageData, error: usageError } = await supabase
            .from('voucher_usage')
            .select(`
              *,
              client:user_id (
                first_name,
                last_name
              ),
              booking:booking_id (
                streamer:streamer_id (
                  id,
                  first_name,
                  last_name,
                  image_url
                )
              )
            `)
            .eq('voucher_id', voucher.id);

          if (usageError) throw usageError;

          const usage = usageData || [];
          const totalDiscount = usage.reduce((sum, u) => sum + u.discount_applied, 0);

          // Process streamer usage statistics
          const streamerUsage = usage.reduce((acc: { [key: number]: StreamerVoucherUsage }, u) => {
            const streamerId = u.booking?.streamer?.id;
            if (streamerId) {
              if (!acc[streamerId]) {
                acc[streamerId] = {
                  streamer_id: streamerId,
                  first_name: u.booking.streamer.first_name,
                  last_name: u.booking.streamer.last_name,
                  image_url: u.booking.streamer.image_url,
                  total_vouchers_used: 0,
                  total_discount_amount: 0,
                  usage_count: 0
                };
              }
              acc[streamerId].total_vouchers_used++;
              acc[streamerId].total_discount_amount += u.discount_applied;
              acc[streamerId].usage_count++;
            }
            return acc;
          }, {});

          // Calculate monthly usage
          const monthlyUsage = usage.reduce((acc: { [key: string]: MonthlyUsage }, u) => {
            const month = new Date(u.used_at).toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!acc[month]) {
              acc[month] = {
                month,
                vouchers_used: 0,
                total_discount: 0
              };
            }
            acc[month].vouchers_used++;
            acc[month].total_discount += u.discount_applied;
            return acc;
          }, {});

          // Calculate status distribution
          const statusCount = usage.reduce((acc: { [key: string]: number }, u) => {
            const status = u.booking?.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          const totalUsage = usage.length;
          const statusUsage: StatusUsage[] = Object.entries(statusCount).map(([status, count]) => ({
            status,
            count,
            percentage: (count / totalUsage) * 100
          }));

          const analytics: VoucherAnalytics = {
            total_vouchers_created: voucher.total_quantity,
            total_vouchers_used: usage.length,
            total_discount_amount: totalDiscount,
            usage_ratio: (usage.length / voucher.total_quantity) * 100,
            top_streamers: Object.values(streamerUsage).sort((a, b) => b.total_discount_amount - a.total_discount_amount),
            monthly_usage: Object.values(monthlyUsage).sort((a, b) => 
              new Date(b.month).getTime() - new Date(a.month).getTime()
            ),
            usage_by_status: statusUsage
          };
          
          return {
            ...voucher,
            total_discount_amount: totalDiscount,
            usage_count: usage.length,
            usage_details: usage,
            analytics
          };
        })
      );

      // Calculate global analytics
      const globalAnalytics: VoucherAnalytics = {
        total_vouchers_created: vouchersWithAnalytics.reduce((sum, v) => sum + v.total_quantity, 0),
        total_vouchers_used: vouchersWithAnalytics.reduce((sum, v) => sum + v.usage_count, 0),
        total_discount_amount: vouchersWithAnalytics.reduce((sum, v) => sum + v.total_discount_amount, 0),
        usage_ratio: vouchersWithAnalytics.reduce((sum, v) => sum + v.usage_count, 0) / 
                    vouchersWithAnalytics.reduce((sum, v) => sum + v.total_quantity, 0) * 100,
        top_streamers: calculateGlobalTopStreamers(vouchersWithAnalytics),
        monthly_usage: calculateGlobalMonthlyUsage(vouchersWithAnalytics),
        usage_by_status: calculateGlobalStatusUsage(vouchersWithAnalytics)
      };

      setVouchers(vouchersWithAnalytics);
      setFilteredVouchers(vouchersWithAnalytics);
      setGlobalAnalytics(globalAnalytics);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load vouchers');
      toast.error('Failed to load vouchers');
    } finally {
      setIsLoading(false);
    }
  };

  const filterVouchers = () => {
    let filtered = [...vouchers];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(voucher =>
        voucher.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        voucher.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(voucher =>
        statusFilter === 'active' ? voucher.is_active : !voucher.is_active
      );
    }

    setFilteredVouchers(filtered);
  };

  const handleCreateVoucher = async (data: FormData) => {
    if (isCreating) return;
    
    setIsCreating(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: insertedData, error } = await supabase
        .from('vouchers')
        .insert({
          ...data,
          code: data.code.toUpperCase(),
          remaining_quantity: data.total_quantity,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      if (!insertedData) {
        throw new Error('No data returned after insertion');
      }

      // Initialize the new voucher with analytics
      const newVoucherWithAnalytics = createDefaultVoucherWithAnalytics(insertedData);
      setVouchers(prev => [newVoucherWithAnalytics, ...prev]);
      toast.success('Voucher created successfully');
      form.reset();
    } catch (error) {
      console.error('Error creating voucher:', error);
      setError(error instanceof Error ? error.message : 'Failed to create voucher');
      toast.error('Failed to create voucher');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetry = () => {
    fetchVouchers();
  };

  function VoucherAnalyticsModal({ 
    voucher, 
    isOpen, 
    onClose 
  }: { 
    voucher: VoucherWithAnalytics; 
    isOpen: boolean; 
    onClose: () => void;
  }) {
    if (!isOpen) return null;

    // Safe access helpers
    const getUsageCount = () => voucher.usage_count || 0;
    const getTotalQuantity = () => voucher.total_quantity || 0;
    const getTotalDiscount = () => voucher.total_discount_amount || 0;
    const getUsageRatio = () => {
      const count = getUsageCount();
      const total = getTotalQuantity();
      return total > 0 ? Math.round((count / total) * 100) : 0;
    };

    return (
      <div 
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-xl w-full max-w-4xl overflow-hidden shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Voucher Analytics: {voucher.code}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Detailed usage statistics and performance metrics
                </p>
              </div>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Total Usage</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {getUsageCount()}/{getTotalQuantity()}
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Total Discount Given</p>
                <p className="text-2xl font-semibold text-green-600">
                  {formatCurrency(getTotalDiscount())}
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Average Discount</p>
                <p className="text-2xl font-semibold text-purple-600">
                  {formatCurrency(getUsageCount() ? Math.round(getTotalDiscount() / getUsageCount()) : 0)}
                </p>
              </div>
              <div className="bg-orange-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Usage Rate</p>
                <p className="text-2xl font-semibold text-orange-600">
                  {getUsageRatio()}%
                </p>
              </div>
            </div>

            {/* Usage History */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Usage History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Price</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {voucher.usage_details && voucher.usage_details.length > 0 ? (
                      voucher.usage_details.map((usage) => (
                        <tr key={usage.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {usage.client ? `${usage.client.first_name} ${usage.client.last_name}` : 'Unknown User'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {format(new Date(usage.used_at), 'dd MMM yyyy HH:mm')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(usage.original_price)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {formatCurrency(usage.discount_applied)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(usage.final_price)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                          No usage history available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper functions for global analytics
  const calculateGlobalTopStreamers = (vouchers: VoucherWithAnalytics[]): StreamerVoucherUsage[] => {
    const streamerMap = new Map<number, StreamerVoucherUsage>();
    
    vouchers.forEach(voucher => {
      voucher.analytics?.top_streamers.forEach(streamer => {
        const existing = streamerMap.get(streamer.streamer_id);
        if (existing) {
          existing.total_vouchers_used += streamer.total_vouchers_used;
          existing.total_discount_amount += streamer.total_discount_amount;
          existing.usage_count += streamer.usage_count;
        } else {
          streamerMap.set(streamer.streamer_id, { ...streamer });
        }
      });
    });

    return Array.from(streamerMap.values())
      .sort((a, b) => b.total_discount_amount - a.total_discount_amount);
  };

  const calculateGlobalMonthlyUsage = (vouchers: VoucherWithAnalytics[]): MonthlyUsage[] => {
    const monthlyMap = new Map<string, MonthlyUsage>();
    
    vouchers.forEach(voucher => {
      voucher.analytics?.monthly_usage.forEach(monthly => {
        const existing = monthlyMap.get(monthly.month);
        if (existing) {
          existing.vouchers_used += monthly.vouchers_used;
          existing.total_discount += monthly.total_discount;
        } else {
          monthlyMap.set(monthly.month, { ...monthly });
        }
      });
    });

    return Array.from(monthlyMap.values())
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
  };

  const calculateGlobalStatusUsage = (vouchers: VoucherWithAnalytics[]): StatusUsage[] => {
    const statusMap = new Map<string, number>();
    let totalUsage = 0;

    vouchers.forEach(voucher => {
      voucher.analytics?.usage_by_status.forEach(status => {
        statusMap.set(status.status, (statusMap.get(status.status) || 0) + status.count);
        totalUsage += status.count;
      });
    });

    return Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: (count / totalUsage) * 100
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50/30">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vouchers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your vouchers and view their usage performance
            </p>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-[#0066FF] hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Voucher
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <div className="px-6 py-6">
                <DialogHeader className="mb-8">
                  <DialogTitle className="text-xl font-semibold">Create New Voucher</DialogTitle>
                  <p className="text-sm text-gray-500 mt-1.5">
                    Add a new voucher code for your customers
                  </p>
                </DialogHeader>
                
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateVoucher)} className="space-y-8">
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }: FieldRenderProps) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Voucher Code</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                maxLength={6}
                                className="uppercase bg-gray-50 font-mono text-lg tracking-wider pl-3 pr-10 h-12"
                                placeholder="SUMMER"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                {field.value.length}/6
                              </div>
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs text-gray-500">
                            6 characters, uppercase letters and numbers only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }: FieldRenderProps) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Description</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Summer sale discount"
                              className="bg-gray-50 h-12"
                            />
                          </FormControl>
                          <FormDescription className="text-xs text-gray-500">
                            Brief description of the voucher's purpose
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="discount_amount"
                        render={({ field }: FieldRenderProps) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Discount Amount</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">Rp</span>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={e => {
                                    const value = e.target.value.replace(/^0+/, '');
                                    field.onChange(value ? parseInt(value) : '');
                                  }}
                                  className="pl-9 bg-gray-50 h-12"
                                  placeholder="50000"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="total_quantity"
                        render={({ field }: FieldRenderProps) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={e => field.onChange(Number(e.target.value))}
                                className="bg-gray-50 h-12"
                                placeholder="100"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="expires_at"
                      render={({ field }: FieldRenderProps) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Expiry Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              min={new Date().toISOString().split('T')[0]}
                              className="bg-gray-50 h-12"
                            />
                          </FormControl>
                          <FormDescription className="text-xs text-gray-500">
                            When this voucher will expire
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Preview Card */}
                    <div className="p-5 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="text-sm font-medium text-gray-600 mb-4">Preview</div>
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-lg bg-[#0066FF] flex items-center justify-center">
                          <span className="text-white text-xl font-bold">%</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-mono text-lg font-semibold tracking-wider">
                            {form.watch("code") || "SUMMER"}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {form.watch("description") || "Summer sale discount"}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-sm font-medium">
                              Rp {form.watch("discount_amount")?.toLocaleString() || "0"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {form.watch("total_quantity") || "0"} vouchers
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isCreating}
                      className={cn(
                        "w-full h-12 text-base font-medium",
                        "bg-[#0066FF] hover:bg-blue-700",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isCreating ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Creating...</span>
                        </div>
                      ) : (
                        'Create Voucher'
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics Dashboard */}
        {globalAnalytics && <AnalyticsDashboard analytics={globalAnalytics} />}

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search vouchers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
              <p className="text-sm text-gray-500">Loading vouchers...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex items-center gap-2 text-red-600 mb-4">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Error loading vouchers</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="flex items-center gap-2"
              >
                Try Again
              </Button>
            </div>
          ) : filteredVouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-gray-500 mb-4">No vouchers found</p>
              {searchQuery || statusFilter !== 'all' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-medium">Code</TableHead>
                  <TableHead className="font-medium">Description</TableHead>
                  <TableHead className="font-medium">Discount</TableHead>
                  <TableHead className="font-medium">Usage</TableHead>
                  <TableHead className="font-medium">Total Discount Given</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="font-medium">Expires At</TableHead>
                  <TableHead className="font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVouchers.map((voucher: Voucher | VoucherWithAnalytics) => (
                  <TableRow key={voucher.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium">{voucher.code}</TableCell>
                    <TableCell className="text-gray-600">{voucher.description}</TableCell>
                    <TableCell>{formatCurrency(voucher.discount_amount)}</TableCell>
                    <TableCell className="text-gray-600">
                      {isVoucherWithAnalytics(voucher) ? `${voucher.usage_count}/${voucher.total_quantity}` : `0/${voucher.total_quantity}`}
                    </TableCell>
                    <TableCell className="text-green-600">
                      {isVoucherWithAnalytics(voucher) ? formatCurrency(voucher.total_discount_amount) : 'Rp 0'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        voucher.is_active 
                          ? 'bg-green-50 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {voucher.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {format(new Date(voucher.expires_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (isVoucherWithAnalytics(voucher)) {
                            setSelectedVoucher(voucher);
                            setIsAnalyticsModalOpen(true);
                          }
                        }}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        View Analytics
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Analytics Modal */}
      {selectedVoucher && (
        <VoucherAnalyticsModal
          voucher={selectedVoucher}
          isOpen={isAnalyticsModalOpen}
          onClose={() => {
            setIsAnalyticsModalOpen(false);
            setSelectedVoucher(null);
          }}
        />
      )}
    </div>
  );
} 