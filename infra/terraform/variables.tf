variable "project_id" {
  description = "deep-hook-468814-t7"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "cors_origin" {
  description = "Allowed CORS origin(s) for the API service. Comma-separated for multiple origins."
  type        = string
  default     = "*"
}
