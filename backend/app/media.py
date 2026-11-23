from pathlib import PurePosixPath
from urllib.parse import urlparse

# Only these locally vendored assets may be returned as catalog media.
LOCAL_CATALOG_IMAGES = {
    "apple-corgi.png",
    "blossom-fawn.png",
    "buttercream-lamb.png",
    "clover-turtle.png",
    "daisy-flower-cushion.png",
    "eucalyptus-koala.png",
    "haneul-bunny-xl.png",
    "hoshi-cloud-bear-xl.png",
    "mallow-floor-sofa.png",
    "maker-bear.jpg",
    "maker-bunny.jpg",
    "maker-cat.jpg",
    "maker-chick.jpg",
    "maker-cloud.jpg",
    "maker-dinosaur.jpg",
    "maker-dog.jpg",
    "maker-penguin.jpg",
    "maker-pink-bunny.jpg",
    "mochi-cloud.png",
    "moon-jelly-wall-hanging.png",
    "moonlight-bat.png",
    "pebble-otter.png",
    "starlight-kitty.png",
    "vanilla-loaf-kitten.png",
    "sleepy-miso-cat.webp",
    "moon-jelly-plush.webp",
    "cocoa-puppy-plush.webp",
    "sunbeam-daisy-cushion.webp",
    "toasty-teddy-plush.webp",
    "honey-star-cushion.webp",
    "moon-jelly-tapestry.webp",
    "cloud-hug-cushion.webp",
    "tidepool-octopus-plush.webp",
    "fern-dino-plush.webp",
    "morning-bunny-plush.webp",
    "strawberry-mushroom-plush.webp",
    "mallow-reading-chair.webp",
    "peach-petal-cushion.webp",
    "seashell-floor-cushion.webp",
    "moon-cloud-throw.webp",
    "ponyo-naptime-cat.webp",
    "ponyo-cat-face-cushion.webp",
    "moon-jelly-mobile.webp",
    "pastel-stacking-cushions.webp",
    "ponyo-cat-throw.webp",
    "ponyo-cat-rug.webp",
    "ponyo-round-cat-seat.webp",
    "ponyo-11.png",
    "ponyo-12.png",
    "ponyo-2.png",
    "ponyo-3.png",
    "ponyo-5.png",
    "ponyo-6.png",
    "ponyo-7.png",
}
LOCAL_CATALOG_LINEUP_IMAGES = {
    "lineup/mochi-cloud.png",
    "lineup/blossom-fawn.png",
    "lineup/eucalyptus-koala.png",
    "lineup/apple-corgi.png",
    "lineup/vanilla-loaf-kitten.png",
    "lineup/buttercream-lamb.png",
    "lineup/moonlight-bat.png",
    "lineup/starlight-kitty.png",
    "lineup/clover-turtle.png",
    "lineup/pebble-otter.png",
}


def storefront_image_url(value: str | None) -> str:
    """Resolve catalog images to Ponyo-hosted static assets, never a vendor CDN."""
    path = PurePosixPath(urlparse(value or "").path)
    relative_lineup_path = "/".join(path.parts[-2:])
    if relative_lineup_path in LOCAL_CATALOG_LINEUP_IMAGES:
        return f"/images/catalog/{relative_lineup_path}"
    filename = path.name
    if filename not in LOCAL_CATALOG_IMAGES:
        filename = "ponyo-2.png"
    return f"/images/catalog/{filename}"
