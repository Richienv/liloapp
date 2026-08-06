"use client";

import { useState } from 'react';
import {
  BarChart3,
  DollarSign,
  Users,
  Clock,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Mock data for reports
const overviewStats = [
  {
    title: 'Total Revenue',
    value: 'Rp 1.2B',
    change: '+23.1%',
    trend: 'up',
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    title: 'Total Bookings',
    value: '2,543',
    change: '+12.5%',
    trend: 'up',
    icon: <Calendar className="w-5 h-5" />,
  },
  {
    title: 'Active Clients',
    value: '892',
    change: '+18.2%',
    trend: 'up',
    icon: <Users className="w-5 h-5" />,
  },
  {
    title: 'Avg. Booking Value',
    value: 'Rp 450K',
    change: '-2.4%',
    trend: 'down',
    icon: <TrendingUp className="w-5 h-5" />,
  },
];

const topClients = [
  { name: 'Tech Corp', spent: 15200000, bookings: 45, growth: '+28%' },
  { name: 'Fashion Hub', spent: 12800000, bookings: 38, growth: '+15%' },
  { name: 'Beauty Co', spent: 9500000, bookings: 28, growth: '+22%' },
  { name: 'Game Studio', spent: 8200000, bookings: 24, growth: '+18%' },
];

const topTeams = [
  { name: 'Team Alpha', earnings: 45600000, streamers: 12, satisfaction: 4.8 },
  { name: 'Team Beta', earnings: 38400000, streamers: 8, satisfaction: 4.7 },
  { name: 'Team Gamma', earnings: 32100000, streamers: 10, satisfaction: 4.9 },
  { name: 'Team Delta', earnings: 28900000, streamers: 6, satisfaction: 4.6 },
];

const peakHours = [
  { time: '10:00', bookings: 156 },
  { time: '12:00', bookings: 235 },
  { time: '14:00', bookings: 478 }, // Peak
  { time: '16:00', bookings: 384 },
  { time: '18:00', bookings: 286 },
  { time: '20:00', bookings: 192 },
];

export default function ReportsPage() {
  const [timeRange, setTimeRange] = useState('7d');

  return (
    <div className="p-8 space-y-8">
      {/* Header with Time Range Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Monitor platform performance and analyze booking trends.
          </p>
        </div>
        <Select
          value={timeRange}
          onValueChange={setTimeRange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="12m">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {overviewStats.map((stat, i) => (
          <div
            key={i}
            className="bg-surface p-6 rounded-panel border border-hairline-input"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                {stat.icon}
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.trend === 'up' ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-ink-muted">{stat.title}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Clients */}
        <div className="bg-surface rounded-panel border border-hairline-input overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Top Clients</h2>
              <Building2 className="w-5 h-5 text-ink-faint" />
            </div>
            <div className="mt-6 space-y-6">
              {topClients.map((client, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">{client.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {client.bookings} bookings
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink">
                      Rp {(client.spent / 1000000).toFixed(1)}M
                    </p>
                    <p className="mt-1 text-sm font-medium text-green-600">
                      {client.growth}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Teams */}
        <div className="bg-surface rounded-panel border border-hairline-input overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Top Teams</h2>
              <Users className="w-5 h-5 text-ink-faint" />
            </div>
            <div className="mt-6 space-y-6">
              {topTeams.map((team, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">{team.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {team.streamers} streamers · {team.satisfaction} rating
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink">
                      Rp {(team.earnings / 1000000).toFixed(1)}M
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Peak Hours */}
        <div className="bg-surface rounded-panel border border-hairline-input overflow-hidden lg:col-span-2">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-ink">Peak Hours</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Most active booking hours during the day
                </p>
              </div>
              <Clock className="w-5 h-5 text-ink-faint" />
            </div>
            <div className="h-[200px] flex items-end gap-4">
              {peakHours.map((hour, i) => {
                const height = (hour.bookings / 478) * 100; // 478 is max bookings
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-blue-100 rounded-t-lg transition-all duration-300"
                      style={{ height: `${height}%` }}
                    />
                    <div className="text-sm text-ink-muted">{hour.time}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 