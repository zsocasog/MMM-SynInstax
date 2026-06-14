# MMM-SynInsta

MagicMirror module for showing Synology Photos images as an Instax/Polaroid-style photo stack.

This module is based on the Synology Photos fetching/cache backend from
[MMM-SynPhotoSlideshow](https://github.com/spydersoft-consulting/MMM-SynPhotoSlideshow)
and the visual stack idea from
[MMM-PhotoStack](https://github.com/Skarabaeus/MMM-PhotoStack).

## Install

Clone or copy this folder into your MagicMirror `modules` directory:

```sh
cd ~/MagicMirror/modules
git clone https://github.com/zsocasog/MMM-SynInsta.git
cd MMM-SynInsta
npm install
```

`npm install` builds `MMM-SynInsta.js`, `node_helper.js`, and `SynInsta.css`.

## Basic MagicMirror config

```js
{
  module: "MMM-SynInsta",
  position: "fullscreen_below",
  config: {
    synologyUrl: "https://your-nas.example.com:5001",
    synologyAccount: "your-user",
    synologyPassword: "your-password",

    displayMode: "instax",
    slideshowSpeed: 10000,
    randomizeImageOrder: true,

    stackWidth: "70vw",
    stackHeight: "80vh",
    stackTop: "10vh",
    stackLeft: "15vw",
    stackFixed: true,

    stackSize: 4,
    frameWidth: 16,
    frameColor: "#fff",
    maxRotation: 8,
    maxOffset: 30
  }
}
```

## Synology auth options

Use account credentials:

```js
config: {
  synologyUrl: "https://your-nas.example.com:5001",
  synologyAccount: "your-user",
  synologyPassword: "your-password",
  synologyAlbumName: "Family Photos"
}
```

Or use a shared album token:

```js
config: {
  synologyUrl: "https://your-nas.example.com:5001",
  synologyShareToken: "share-token-from-synology-link"
}
```

You can also filter by Synology Photos tags:

```js
config: {
  synologyTagNames: ['Family', 'Favorites'];
}
```

## Instax layout options

| Option                 | Default         | Description                                                                            |
| ---------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `displayMode`          | `"instax"`      | Use `"instax"` for the card stack or `"fullscreen"` for the original slideshow layout. |
| `stackWidth`           | `"100vw"`       | Stack area width. Accepts CSS lengths or numbers in pixels.                            |
| `stackHeight`          | `"100vh"`       | Stack area height. Accepts CSS lengths or numbers in pixels.                           |
| `stackTop`             | `"0"`           | CSS `top` position for the stack area.                                                 |
| `stackRight`           | `"auto"`        | CSS `right` position for the stack area.                                               |
| `stackBottom`          | `"auto"`        | CSS `bottom` position for the stack area.                                              |
| `stackLeft`            | `"0"`           | CSS `left` position for the stack area.                                                |
| `stackTransform`       | `"none"`        | Optional CSS transform, useful for centering with `translate(-50%, -50%)`.             |
| `stackFixed`           | `true`          | If true, the stack is positioned relative to the screen.                               |
| `stackZIndex`          | `0`             | CSS z-index for the stack container.                                                   |
| `stackSize`            | `4`             | Number of visible cards kept on screen.                                                |
| `photoWidth`           | `null`          | Optional max photo width in pixels.                                                    |
| `photoHeight`          | `null`          | Optional max photo height in pixels.                                                   |
| `frameWidth`           | `16`            | Instax frame thickness in pixels.                                                      |
| `frameColor`           | `"#fff"`        | Frame color.                                                                           |
| `stackBackgroundColor` | `"transparent"` | Stack area background.                                                                 |
| `maxRotation`          | `8`             | Maximum random card rotation in degrees.                                               |
| `maxOffset`            | `30`            | Maximum random card offset in pixels.                                                  |
| `flyInDuration`        | `1200`          | New card fly-in animation duration in milliseconds.                                    |
| `flyOutDuration`       | `800`           | Old card fly-out animation duration in milliseconds.                                   |

## Position examples

Centered smaller stack:

```js
config: {
  stackWidth: "60vw",
  stackHeight: "70vh",
  stackTop: "50%",
  stackLeft: "50%",
  stackTransform: "translate(-50%, -50%)"
}
```

Right side stack:

```js
config: {
  stackWidth: "42vw",
  stackHeight: "80vh",
  stackTop: "10vh",
  stackRight: "4vw",
  stackLeft: "auto"
}
```

## Other useful slideshow options

The Synology slideshow options from the original backend are still available, including:

- `synologyMaxPhotos`
- `refreshImageListInterval`
- `enableImageCache`
- `imageCacheMaxSize`
- `imageCachePreloadCount`
- `resizeImages`
- `maxWidth`
- `maxHeight`
- `sortImagesBy`
- `sortImagesDescending`
- `showImageInfo`
- `imageInfo`
- `showProgressBar`

For credential safety, you can also use a module-local `.env` file. See `.env.example`.
