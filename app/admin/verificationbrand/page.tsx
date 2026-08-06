"use client";

import { useState } from 'react';
import { cn } from "@/lib/utils";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Building2,
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

interface BrandVerification {
  id: string;
  companyName: string;
  email: string;
  industry: string;
  documentUrl: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
}

const mockBrands: BrandVerification[] = [
  {
    id: '1',
    companyName: 'Tech Solutions Inc',
    email: 'business@techsolutions.com',
    industry: 'Technology',
    documentUrl: '/docs/tech-solutions.pdf',
    status: 'pending',
    submittedAt: '2024-03-10',
  },
  {
    id: '2',
    companyName: 'Fashion Forward',
    email: 'verify@fashionforward.com',
    industry: 'Fashion',
    documentUrl: '/docs/fashion-forward.pdf',
    status: 'pending',
    submittedAt: '2024-03-09',
  },
];

export default function BrandVerificationPage() {
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusBadge = (status: BrandVerification['status']) => {
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
            Pending Review
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Brand Verification</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Review and verify brand registration requests
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
          <Input
            placeholder="Search by company name or email..."
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Verification Table */}
      <div className="bg-surface rounded-panel border border-hairline-input overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-tint/50">
              <TableHead className="font-medium w-[250px]">Company</TableHead>
              <TableHead className="font-medium">Industry</TableHead>
              <TableHead className="font-medium">Status</TableHead>
              <TableHead className="font-medium">Submitted</TableHead>
              <TableHead className="font-medium">Documents</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockBrands.map((brand) => (
              <TableRow key={brand.id} className="hover:bg-surface-tint/50">
                <TableCell>
                  <div>
                    <div className="font-medium text-ink">{brand.companyName}</div>
                    <div className="text-sm text-ink-soft">{brand.email}</div>
                  </div>
                </TableCell>
                <TableCell>{brand.industry}</TableCell>
                <TableCell>{getStatusBadge(brand.status)}</TableCell>
                <TableCell className="text-ink-soft">
                  {new Date(brand.submittedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm">
                    Lihat Dokumen
                  </Button>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                      <DropdownMenuItem>Lihat Detail</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-green-600">
                        Setujui Brand
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        Tolak Brand
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
            Showing 1-2 of 2 requests
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 