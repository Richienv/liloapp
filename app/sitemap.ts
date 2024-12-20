import { MetadataRoute } from 'next'
import { createClient } from '@/utils/supabase/server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient()
  
  // Fetch all active streamers
  const { data: streamers } = await supabase
    .from('streamers')
    .select('username, updated_at, location')
    .eq('is_active', true)
  
  // Fetch all locations
  const { data: locations } = await supabase
    .from('streamers')
    .select('location')
    .eq('is_active', true)
    .distinct()
  
  const baseUrl = 'https://salda.id'

  const routes = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ]

  // Add streamer profile URLs
  const streamerRoutes = (streamers ?? []).map((streamer) => ({
    url: `${baseUrl}/${streamer.username}`,
    lastModified: new Date(streamer.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Add location-based pages
  const locationRoutes = locations?.map(loc => ({
    url: `${baseUrl}/location/${encodeURIComponent(loc.location)}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  })) || []

  return [...routes, ...streamerRoutes, ...locationRoutes]
} 