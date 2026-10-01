/**
 * Family Wealth page strings (en).
 * Single source for UI text: no hardcoded strings in components.
 */

export const FAMILY_STRINGS = {
  // Page titles and navigation
  page_title: "Family Wealth",
  page_description: "Manage household wealth sharing with family members",

  // Tabs
  tab_overview: "Overview",
  tab_sharing: "Sharing",

  // Overview tab
  overview_kpi_net_worth: "Net Worth",
  overview_kpi_assets: "Assets",
  overview_kpi_liabilities: "Liabilities",
  overview_kpi_members: "Members",
  overview_period_6m: "Last 6 months",
  overview_period_1y: "Last year",
  overview_period_all: "All time",
  overview_converted_note: "Converted to {currency} at {date} rates",
  overview_rate_unavailable: "Some rates unavailable — partial amounts shown",
  overview_investment_unpriced: "Some investments not priced",
  overview_section_error: "Data temporarily unavailable",
  overview_member_label: "Member",
  overview_member_me: "You",
  overview_member_you_shared: "You shared",
  overview_not_shared: "Not shared",
  overview_generic_label_hint: "Some labels encrypted — shown generically",
  overview_partial_flag: "Partial data",
  overview_accounts_title: "Accounts",
  overview_investments_title: "Investments",
  overview_net_worth_title: "Net Worth",
  overview_goals_title: "Goals",
  overview_budgets_title: "Budgets",
  overview_loans_title: "Loans",
  overview_cashflow_title: "Cashflow",
  overview_member_table_account: "Account",
  overview_member_table_type: "Type",
  overview_member_table_balance: "Balance",
  overview_member_table_native: "Native",

  // Sharing tab - general
  sharing_outgoing_title: "I share",
  sharing_outgoing_empty: "You haven't shared your data yet",
  sharing_incoming_title: "Shared with me",
  sharing_incoming_empty: "No one has shared their data with you",
  sharing_status_pending: "Pending",
  sharing_status_awaiting_unlock: "Awaiting unlock",
  sharing_status_active: "Active",
  sharing_status_suspended: "Suspended",
  sharing_status_revoked: "Revoked",
  sharing_status_declined: "Declined",
  sharing_status_expired: "Expired",
  sharing_status_key_reset: "Key reset",
  sharing_list_created_at: "Created",
  sharing_list_accepted_at: "Accepted",
  sharing_list_last_viewed: "Last viewed",
  sharing_list_actions: "Actions",
  sharing_list_edit_sections: "Edit",
  sharing_list_resend: "Resend",
  sharing_list_revoke: "Revoke",
  sharing_list_accept: "Accept",
  sharing_list_decline: "Decline",

  // Invite dialog
  invite_dialog_title: "Invite family member",
  invite_dialog_email_label: "Email address",
  invite_dialog_email_placeholder: "family@example.com",
  invite_dialog_sections_label: "Share access to",
  invite_dialog_sections_all: "All current and future sections",
  invite_dialog_must_share_back: "Require them to share back",
  invite_dialog_must_share_back_description: "They must share the same sections with you to accept",
  invite_dialog_disclosure_title: "Share disclosure",
  invite_dialog_disclosure_net_worth: "They will see your net worth",
  invite_dialog_disclosure_sections: "They will see: {sections}",
  invite_dialog_button_invite: "Send invite",
  invite_dialog_button_cancel: "Cancel",
  invite_dialog_error_invalid_email: "Please enter a valid email",
  invite_dialog_error_self_invite: "You cannot share with yourself",
  invite_dialog_success: "Invite sent to {email}",
  invite_dialog_section_net_worth: "Net worth, assets, liabilities, and trends",
  invite_dialog_section_accounts: "Account names, types, and balances",
  invite_dialog_section_investments: "Investment holdings and allocation",
  invite_dialog_section_goals: "Savings goals and progress",
  invite_dialog_section_budgets: "Budget categories and spending",
  invite_dialog_section_loans: "Loans, balances, and payoff dates",
  invite_dialog_section_cashflow: "Monthly income and expenses",

  // Share card / list item
  share_card_email: "Email",
  share_card_name: "Name",
  share_card_sections: "Sections",
  share_card_invited_by: "Invited by",
  share_card_expires_in: "Expires in",

  // Revoke dialog
  revoke_dialog_title: "Revoke access",
  revoke_dialog_message: "Are you sure? They will no longer see your shared data. Labels they've already seen will remain readable.",
  revoke_dialog_button_cancel: "Cancel",
  revoke_dialog_button_revoke: "Revoke",
  revoke_dialog_success: "Access revoked",

  // Decline dialog
  decline_dialog_title: "Decline invite",
  decline_dialog_message: "Are you sure? You won't be able to recover the invite without asking them to resend it.",
  decline_dialog_button_cancel: "Cancel",
  decline_dialog_button_decline: "Decline",
  decline_dialog_success: "Invite declined",

  // Accept flow (deep link)
  accept_loading: "Processing invite...",
  accept_success: "Invite accepted! You now have access to their Family Wealth data.",
  accept_error: "Could not accept invite",
  accept_expired: "This invite has expired or is no longer valid",

  // Update sections
  update_sections_dialog_title: "Update shared sections",
  update_sections_success: "Sections updated",
  update_sections_error: "Could not update sections",
  update_sections_minimum_required: "You must share the required sections to keep this share active",

  // Re-consent
  reconsent_title: "Changes require approval",
  reconsent_message: "They've widened their share. Please review and approve the new sections.",
  reconsent_button_accept: "Accept",
  reconsent_button_decline: "Decline",

  // Step-up (password re-entry)
  step_up_title: "Verify your identity",
  step_up_message: "Enter your password to confirm this action",
  step_up_password_label: "Password",
  step_up_button_verify: "Verify",
  step_up_button_cancel: "Cancel",
  step_up_error: "Incorrect password",
  step_up_expired: "Your session has expired. Please try again.",

  // MFA gate
  mfa_required_title: "Two-factor authentication required",
  mfa_required_message: "Family Wealth requires 2FA for security. Enable it in your account settings.",
  mfa_required_button_setup: "Set up 2FA",
  mfa_required_button_skip: "Back",

  // Error states
  error_loading_data: "Could not load Family Wealth data",
  error_loading_shares: "Could not load sharing information",
  error_rate_limited: "Too many requests. Please try again later.",
  error_generic: "Something went wrong",

  // Success messages
  success_invite_resent: "Invite resent to {email}",
} as const;

export type FamilyString = keyof typeof FAMILY_STRINGS;
