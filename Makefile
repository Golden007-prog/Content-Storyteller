# ---------------------------------------------------------------------------
# Makefile — Content Storyteller task runner
# ---------------------------------------------------------------------------

.PHONY: bootstrap build deploy deploy-backend deploy-frontend dev tf-plan tf-apply tf-destroy

## bootstrap — Initialize GCP project, authenticate, and provision infrastructure
bootstrap:
	bash scripts/bootstrap.sh

## build — Build and push Docker images to Artifact Registry
build:
	bash scripts/build.sh

## deploy — Deploy latest images to Cloud Run
deploy:
	bash scripts/deploy.sh

## deploy-backend — Build and deploy API + Worker to Cloud Run
deploy-backend:
	bash scripts/deploy-backend.sh

## deploy-frontend — Build frontend for GitHub Pages
deploy-frontend:
	bash scripts/deploy-frontend.sh

## dev — Start local development servers
dev:
	bash scripts/dev.sh

## tf-plan — Preview Terraform changes
tf-plan:
	terraform -chdir=infra/terraform plan

## tf-apply — Apply Terraform configuration
tf-apply:
	terraform -chdir=infra/terraform apply

## tf-destroy — Destroy all Terraform-managed resources
tf-destroy:
	terraform -chdir=infra/terraform destroy
