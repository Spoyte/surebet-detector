#!/bin/bash
# Deploy Surebet Detector to Kubernetes

set -e

NAMESPACE="surebet"
IMAGE_TAG="${1:-latest}"
ENVIRONMENT="${2:-production}"

echo "🚀 Deploying Surebet Detector to Kubernetes"
echo "   Image Tag: $IMAGE_TAG"
echo "   Environment: $ENVIRONMENT"
echo ""

# Build and push Docker image
echo "📦 Building Docker image..."
docker build -t surebet-detector:$IMAGE_TAG .
docker tag surebet-detector:$IMAGE_TAG registry.example.com/surebet-detector:$IMAGE_TAG
docker push registry.example.com/surebet-detector:$IMAGE_TAG

# Create namespace if it doesn't exist
echo "📁 Creating namespace..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply secrets
echo "🔐 Applying secrets..."
kubectl apply -f k8s/secrets.yaml -n $NAMESPACE

# Deploy using Helm
echo "⎈ Deploying with Helm..."
helm upgrade --install surebet-detector ./k8s/helm \
  --namespace $NAMESPACE \
  --set image.tag=$IMAGE_TAG \
  --set config.nodeEnv=$ENVIRONMENT \
  --wait \
  --timeout 5m

# Wait for rollout
echo "⏳ Waiting for rollout to complete..."
kubectl rollout status deployment/surebet-detector -n $NAMESPACE --timeout=300s

# Verify deployment
echo "✅ Verifying deployment..."
kubectl get pods -n $NAMESPACE
kubectl get svc -n $NAMESPACE
kubectl get ingress -n $NAMESPACE

echo ""
echo "🎉 Deployment complete!"
echo "   API Endpoint: https://api.surebet-detector.com"
echo "   Health Check: https://api.surebet-detector.com/health"
echo "   Metrics: https://api.surebet-detector.com/metrics"
