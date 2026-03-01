export interface User {
  id: number;
  email: string;
  username: string;
  display_name: string;
}

export interface Club {
  id: number;
  name: string;
  description: string;
  role?: string;
  member_count?: number;
  created_at: string;
}

export interface Member {
  id: number;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
}

export interface InviteCode {
  code: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  created_at: string;
}

export interface Meeting {
  id: number;
  club_id: number;
  title: string;
  address: string;
  scheduled_at: string;
  cookbook: string;
  cookbook_key: string;
  cookbook_author: string;
  cookbook_cover_url: string;
  cookbook_first_publish_year: number;
  created_by_user_id: number;
  ended_at: string;
  ended_by_user_id: number;
  host_user_id: number;
  host_name: string;
  notes: string;
  created_at: string;
}

export interface CookbookSearchResult {
  key: string;
  title: string;
  authors: string[];
  first_publish_year?: number;
  edition_count?: number;
  cover_url?: string;
  openlibrary_url: string;
}

export interface Recipe {
  id: number;
  meeting_id: number;
  user_id: number;
  user_name: string;
  title: string;
  notes: string;
  source_url: string;
  created_at: string;
}

export interface MediaPost {
  id: number;
  meeting_id: number;
  user_id: number;
  user_name: string;
  media_type: "image" | "video";
  media_url: string;
  caption: string;
  created_at: string;
}

export interface PollOption {
  id: number;
  option: string;
  vote_count: number;
  voted_by_me: boolean;
}

export interface Poll {
  id: number;
  meeting_id: number;
  question: string;
  creator: string;
  closes_at: string;
  created_at: string;
  options: PollOption[];
}

export interface Feedback {
  id: number;
  meeting_id: number;
  user_id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}
