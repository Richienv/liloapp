"use client";

import { useState } from 'react';
import Image from 'next/image';
import { cn } from "@/lib/utils";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface Streamer {
  id: string;
  email: string;
  name: string;
  imageUrl: string;
  currentPrice: number;
  previousPrice: number;
  totalBookings: number;
  canceledBookings: number;
  verificationStatus: 'verified' | 'pending' | 'rejected';
  joinedDate: string;
  platform: 'shopee' | 'tiktok';
}

const mockStreamers: Streamer[] = [
  {
    id: '1',
    email: 'sarah@example.com',
    name: 'Sarah Chen',
    imageUrl: '/placeholder-avatar.png',
    currentPrice: 150000,
    previousPrice: 120000,
    totalBookings: 45,
    canceledBookings: 2,
    verificationStatus: 'verified',
    joinedDate: '2024-01-15',
    platform: 'shopee',
  },
  {
    id: '2',
    email: 'mike@example.com',
    name: 'Mike Johnson',
    imageUrl: '/placeholder-avatar.png',
    currentPrice: 200000,
    previousPrice: 200000,
    totalBookings: 32,
    canceledBookings: 1,
    verificationStatus: 'pending',
    joinedDate: '2024-02-01',
    platform: 'tiktok',
  },
  // Add more mock data as needed
];

export default function StreamersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusBadge = (status: Streamer['verificationStatus']) => {
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Verified
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <AlertCircle className="w-3.5 h-3.5 mr-1" />
            Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="w-3.5 h-3.5 mr-1" />
            Rejected
          </Badge>
        );
    }
  };

  const getPlatformBadge = (platform: Streamer['platform']) => {
    const styles = {
      shopee: 'bg-surface-tint text-ink-muted border border-hairline',
      tiktok: 'bg-surface-tint text-ink-muted border border-hairline',
    };

    return (
      <Badge className={`${styles[platform]} text-white border-0`}>
        {platform.charAt(0).toUpperCase() + platform.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Streamers</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Manage and monitor all registered streamers on the platform.
          </p>
        </div>
        <Button className="bg-[#0066FF] hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Streamer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
          <Input
            placeholder="Search streamers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filterStatus}
          onValueChange={setFilterStatus}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          More Filters
        </Button>
      </div>

      {/* Streamers Table */}
      <div className="bg-surface rounded-panel border border-hairline-input overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-tint/50">
              <TableHead className="font-medium w-[300px]">
                <div className="flex items-center gap-2">
                  Name
                  <ArrowUpDown className="w-4 h-4 text-ink-faint" />
                </div>
              </TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium text-right">Current Price</TableHead>
              <TableHead className="font-medium text-right">Previous Price</TableHead>
              <TableHead className="font-medium text-right">Total Bookings</TableHead>
              <TableHead className="font-medium text-right">Canceled</TableHead>
              <TableHead className="font-medium">Platform</TableHead>
              <TableHead className="font-medium">Created at</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockStreamers.map((streamer) => (
              <TableRow key={streamer.id} className="hover:bg-surface-tint/50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-tint overflow-hidden flex-shrink-0">
                      <Image
                        src={streamer.imageUrl}
                        alt={streamer.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="font-medium text-ink">{streamer.name}</div>
                      <div className="text-sm text-ink-soft">{streamer.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(streamer.verificationStatus)}</TableCell>
                <TableCell className="text-right font-medium">
                  Rp {streamer.currentPrice.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-ink-soft">
                  Rp {streamer.previousPrice.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {streamer.totalBookings}
                </TableCell>
                <TableCell className="text-right text-ink-soft">
                  {streamer.canceledBookings}
                </TableCell>
                <TableCell>{getPlatformBadge(streamer.platform)}</TableCell>
                <TableCell className="text-ink-soft">
                  {new Date(streamer.joinedDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>View Profile</DropdownMenuItem>
                      <DropdownMenuItem>View Bookings</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-green-600">
                        Verify Streamer
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        Suspend Account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-4 border-t border-hairline-input">
          <div className="text-sm text-ink-soft">
            Showing 1-5 of 10 streamers
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 