/**
 * Supabase database types for the catering manager beta.
 * These types mirror the Supabase tables created via migrations.
 */

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  business_name: string;
  business_logo_url: string;
  trial_started_at: string;
  trial_ends_at: string;
  subscription_status: "trial" | "active" | "expired" | "limited" | "free_access";
  revenuecat_customer_id: string | null;
  user_status: "active" | "blocked" | "tester";
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  id: number;
  trial_days: number;
  paywall_enabled: boolean;
  paywall_mode: "off" | "trial_expired" | "hard";
  maintenance_enabled: boolean;
  maintenance_message: string;
  minimum_supported_version: string;
  force_update_enabled: boolean;
  global_message_enabled: boolean;
  global_message_text: string;
  global_message_type: "info" | "warning" | "success" | "update";
  global_message_action_text: string;
  global_message_action: string;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlag {
  id: number;
  flag_name: string;
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RemoteConfig {
  id: number;
  schema_version: number;
  paywall_enabled: boolean;
  revenuecat_enabled: boolean;
  remote_campaigns_enabled: boolean;
  feedback_popup_enabled: boolean;
  global_message_enabled: boolean;
  external_urls_enabled: boolean;
  // Force Update fields
  force_update_enabled: boolean;
  minimum_supported_version_code: number;
  latest_version_code: number;
  force_update_title: string;
  force_update_message: string;
  force_update_button_text: string;
  google_play_url: string;
  created_at: string;
  updated_at: string;
}

export interface AllowedExternalDomain {
  id: number;
  domain: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface Feedback {
  id: number;
  user_id: string;
  message: string;
  screen_context: string;
  created_at: string;
}

// ============ DEVICE BINDING TYPES ============

export type DeviceStatus = "active" | "inactive";

export interface UserDevice {
  id: string;
  user_id: string;
  device_uuid: string;
  device_name: string;
  device_os: string;
  app_version: string;
  status: DeviceStatus;
  created_at: string;
  last_active_at: string;
}

export interface TransferCode {
  id: string;
  user_id: string;
  code_hash: string;
  new_device_uuid: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  attempts: number;
}

export type BackupType = "auto" | "manual" | "before_restore";

export interface UserBackup {
  id: string;
  user_id: string;
  file_path: string;
  backup_type: BackupType;
  backup_size: number | null;
  device_id: string | null;
  device_name: string;
  app_version: string;
  schema_version: number;
  logo_path: string | null;
  logo_hash: string | null;
  logo_updated_at: string | null;
  logo_mime_type: string | null;
  logo_file_size: number | null;
  created_at: string;
}

export type TransferAuditStatus = "requested" | "completed" | "failed";

export interface TransferAudit {
  id: string;
  user_id: string;
  old_device_uuid: string | null;
  new_device_uuid: string | null;
  status: TransferAuditStatus;
  created_at: string;
  completed_at: string | null;
}

export interface DeviceVerificationLimit {
  id: string;
  user_id: string;
  verified_at: string;
  device_uuid: string;
}
