IMAGES_LIST="node:10-alpine node:8-alpine node:11-alpine"
for image in $IMAGES_LIST; do
  mkdir -p "./$(echo $image | tr : /)"
  sed "s/%%IMAGE%%/$image/g"  Dockerfile.template > "./$(echo $image | tr : /)/Dockerfile"
  echo "Saved $image"
done
