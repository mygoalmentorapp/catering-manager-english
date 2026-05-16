/**
 * VideoTutorialsService — Fetches video topics and tutorials from Supabase
 * with simple local caching via CacheManager.
 */
import { supabase } from "@/lib/supabase";
import { CacheManager } from "./cache-manager";

// ── Types ──

export interface VideoTopic {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface VideoTutorial {
  id: string;
  topic_id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface TopicWithVideos extends VideoTopic {
  videos: VideoTutorial[];
}

// ── Constants ──

const CACHE_KEY_TOPICS = "video_topics";
const CACHE_KEY_TUTORIALS = "video_tutorials";
/** Cache TTL: 30 minutes */
const CACHE_TTL = 30 * 60 * 1000;

// ── Helpers ──

/**
 * Extract YouTube video ID from a full URL.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  return null;
}

// ── Service ──

export const VideoTutorialsService = {
  /**
   * Fetch all active topics with their active videos, sorted by sort_order.
   * Uses cache if available and not expired.
   * Returns null if fetch fails and no cache is available.
   */
  async getTopicsWithVideos(): Promise<TopicWithVideos[] | null> {
    // Try cache first
    const cached = await CacheManager.get<TopicWithVideos[]>(CACHE_KEY_TOPICS);
    
    try {
      // Fetch topics
      const { data: topics, error: topicsError } = await supabase
        .from("video_topics")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (topicsError || !topics) {
        // Return cache if fetch fails
        return cached;
      }

      // Fetch tutorials
      const { data: tutorials, error: tutorialsError } = await supabase
        .from("video_tutorials")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (tutorialsError || !tutorials) {
        // Return cache if fetch fails
        return cached;
      }

      // Combine topics with their videos
      const topicsWithVideos: TopicWithVideos[] = topics
        .map((topic) => ({
          ...topic,
          videos: tutorials.filter((t) => t.topic_id === topic.id) }))
        // Only show topics that have at least one active video
        .filter((topic) => topic.videos.length > 0);

      // Update cache
      await CacheManager.set(CACHE_KEY_TOPICS, topicsWithVideos, CACHE_TTL);

      return topicsWithVideos;
    } catch {
      // Network error — return cache if available
      return cached;
    }
  },

  /**
   * Clear the video tutorials cache.
   */
  async clearCache(): Promise<void> {
    await CacheManager.remove(CACHE_KEY_TOPICS);
    await CacheManager.remove(CACHE_KEY_TUTORIALS);
  } };
