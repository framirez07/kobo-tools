# kobo-img-fs-updater
JS program to get data from KoBo api and download media from a KoBo server.

## Description
kobo-img-fs-updater script **gets an accurate set of images attached to KoBoToolbox forms**. 

* Is configurable: Provides ways to configure the forms and record id's on which images are going to be updated. 
* Performs validations to ensure that the downloaded image set is accurate, i.e. that only the images currently attached to records, and no more, are kept in the final image set. The validations performed includes attachment-id validation and hash-integrity validation; also performs a cleaning step to remove the existing images in the output directory that are not valid or up to date attachments. 
* Provides as output: 
  * a directory with all the images downloaded and validated,
  * a csv file with image information (including size, dimensions and hash),
  * as well as extensive logs and output files to track each of the tasks performed by the script. 
* On re-run the script over the same set of assets and configurations, and over a previous obtained output, the update process will download only the images that has changed and will remove the ones that are not anymore part of the KoBo form record attachments for the configured submission ids.

## Installation
* Get a copy of this project, for example:
```sh
# Clone the project from GitHub
git clone <git_project_url>
```

* To install the project you can use `npm install`

## Basic configuration
You can provide a `run-configs.json` file with basic configuration parameters.

```json
{
  "token": "d3585b44a3ada6416be99818d4b4f4c0f2c7077f", 
  "apiServerUrl": "https://kobo.conabio.gob.mx/",
  "mediaServerUrl": "https://kcat.conabio.gob.mx/",
  "outputDir": "output",
  "deleteImages": false,
  "filters": [
    {
      "assetId": "aeUTa3g2VzbPP5SGoTx8Rp",
      "submissionIdsCsv": "colectas.csv",
      "submissionIdsCsvIdColumnName": "id",
      "submissionIdsCsvSeparator": ","
    }
  ]
}
```
**Note:** Put the configuration file in the predefined directory `run-configs` so you can specify only the name (without path) when you run the script.

* outputDir: must exists.

## Usage
Execute the following command to start the image-update process over the configured assets.
```sh
# you can run with node
node ./kobo-imgs-fs-updater.js -f run-configs.json

# or with npm
npm start -- -f run-configs.json
```


## Output results
At the end of the process, you will have the following output tree:
```console
output/
├── .attachments_map
│   └── aeUTa3g2VzbPP5SGoTx8Rp
│       ├── 1721
│       └── 1723
├── images
│   └── aeUTa3g2VzbPP5SGoTx8Rp
│       └── GEF_colectas_RG016
│           ├── 1721_1579374170278.jpg
│           ├── 1721_1579374245054.jpg
│           ├── 1721_1579374270078.jpg
│           ├── 1721_1579374287914.jpg
│           ├── 1723_1579374308256.jpg
│           ├── 1723_1579374347354.jpg
│           ├── 1723_1579374392261.jpg
│           ├── 1723_1579374430920.jpg
│           └── data
│               └── images_info.csv
└── runs
    └── run_2020-11-17-19-40-59
```
The `images` directory will contain the downloaded images, corresponding to the assets and submissions-ids configured. The `data` directory will contain the file `images_info.csv` that looks as follows:

```csv
assetUid,assetName,recordId,name,size,sizeMB,type,dimensions,width,height,hash
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1721,1721_1579374170278.jpg,4132284,4.13MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-240650581,1759009758,-738380866,-1252016960,-1117734626,-2098850447,-1669759583,1939428331]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1721,1721_1579374245054.jpg,7658307,7.66MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-2107362895,1501112355,-1378498611,-1090845309,522225366,-1172291672,-1116237041,-360917577]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1721,1721_1579374270078.jpg,4160413,4.16MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-1716067697,45361568,-1002483612,-1341406519,-58516787,-720829260,1974367655,-216617698]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1721,1721_1579374287914.jpg,7452144,7.45MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-1089216671,-186613993,-1101340157,2106466214,64105590,123906609,-1979905858,2102977033]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1723,1723_1579374308256.jpg,6177655,6.18MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[1789314038,1095443034,-190271744,1038995168,-221165226,-1923081117,1783458859,539587516]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1723,1723_1579374347354.jpg,5909566,5.91MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[-2121826268,-2114841587,1269747967,-805584337,614506380,-1644648640,-1905631139,1750768959]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1723,1723_1579374392261.jpg,5699688,5.7MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[-359204658,-472504106,676645795,1864634546,1216755732,-802929860,1129053626,1445613292]"
aeUTa3g2VzbPP5SGoTx8Rp,GEF_colectas_RG016,1723,1723_1579374430920.jpg,7431575,7.43MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[355624210,423644185,-1299040392,1733903363,-747128272,157906734,-94938422,-324057370]"
```
The `.attachments_map` hidden directory contains information that allows the script to check for integrity and validity, of current images, in following runs of the script, over the same `output` directory. And the `runs` directory, contains a timestamped directory per each run of the script, with logs and track files corresponding to the task made by the script.


## Action maps
For each image-field of each submitted record, the script builds an map or object as the following:
```json
    [
      {
        "_id": 1721,
        "ImagenEjemplar1": {
          "value": "1579374170278.jpg",
          "attachment": {
            "mimetype": "image/jpeg",
            "download_url": "/media/ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374170278.jpg",
            "filename": "ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374170278.jpg",
            "instance": 1721,
            "id": 2395,
            "xform": 177
          },
          "action": "keep",
          "subm_mapped_key": "Fotografias/ImagenEjemplar1"
        },
        "ImagenEjemplar2": {
          "value": "1579374245054.jpg",
          "attachment": {
            "mimetype": "image/jpeg",
            "download_url": "/media/ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374245054.jpg",
            "filename": "ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374245054.jpg",
            "instance": 1721,
            "id": 2454,
            "xform": 177
          },
          "action": "keep",
          "subm_mapped_key": "Fotografias/ImagenEjemplar2"
        },
        "ImagenEjemplar3": {
          "value": "1579374270078.jpg",
          "attachment": {
            "mimetype": "image/jpeg",
            "download_url": "/media/ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374270078.jpg",
            "filename": "ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374270078.jpg",
            "instance": 1721,
            "id": 2455,
            "xform": 177
          },
          "action": "keep",
          "subm_mapped_key": "Fotografias/ImagenEjemplar3"
        },
        "ImagenEjemplar4": {
          "value": "1579374287914.jpg",
          "attachment": {
            "mimetype": "image/jpeg",
            "download_url": "/media/ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374287914.jpg",
            "filename": "ooliver/attachments/342dd96b86de4ce390bdc5dbaa7c2960/2ae0c51e-72b0-4de9-9b98-d73abe4a2e43/1579374287914.jpg",
            "instance": 1721,
            "id": 2458,
            "xform": 177
          },
          "action": "keep",
          "subm_mapped_key": "Fotografias/ImagenEjemplar4"
        },
        "ImagenEjemplar5": {
          "attachment": null,
          "action": "delete"
        },
        "ImagenEjemplar6": {
          "attachment": null,
          "action": "delete"
        }
      }
    ]

```
In this case, each of the keys `ImagenEjemplar1`, ..., `ImagenEjemplar6` are image-fields and for each of them there is an action to be executed. The possible actions are:

action      | description
---         | ---
`keep`      | The image will be *downloaded* if not exists. If exists will be *kept*.
`delete`    | The image will be *cleaned* if exists.
`none`      | The image will be *moved* to `images_deleted` dir if exists.

Each action is determined as following:
```
/**
 * Build action map
 * 
 *  - keep
 *    if @value exists, it means that there exists an attachment corresponding
 *    to an image called '@value', and so this image must be kept o downloaded
 *    if not exists already or if it is outdated (i.e. a newer image with same 
 *    name exists in attachments).
 * 
 *  - delete
 *    if @value does not exists, it means that there is not an attachment
 *    corresponding to an image called '@value', and so this image must be
 *    deleted if exits locally.
 * 
 *  - none
 *    if @value exists, but there isn't attachment for it, the process
 *    will report this case as a warning, and, if the image exists, the
 *    cleaning process will moved it to 'images_deleted' dir.
 */
```

## Validity and integrity checks
When an image exists and is marked as `keep`, the script will do the following checks to determine if the image can be kept as currently is or needs to be downloaded again:
```
/**
 * The following checks will be done before start to
 * download an image:
 * 
 *  - Exists?
 *      - yes: is up to date?
 *              - yes:  up to date.
 *                      - has valid hash?
 *                          - yes: ok, no need download.
 *                          - no: download.
 *              - no:   download.
 *      - no: download
 * 
 * In order to confirm if an existing image is up to date,
 * an attachment map is created and stored for each downloaded
 * image. The map is stored in the following path:
 * 
 *    output/images/.attachmentMap/{assetId}/{submissionId}/{field.autoname}.json
 * 
 * There will be a json map for each image that is downloaded. Each map will
 * be of the following form:
 * 
 * {
 *    "imageName":"1721_1579374170278.jpg",
 *    "originalName":"1579374170278.jpg",
 *    "attachmentId":2395,
 *    "saveTimestamp":"2020-11-17-19-41-36",
 *    "imgInfo":{
 *    "hash":[-240650581,1759009758,-738380866,-1252016960,-1117734626,-2098850447,-1669759583,1939428331],
 *    "width":2976,
 *    "height":3968,
 *    "dimensions":"width: 2976 pixels, height: 3968 pixels",
 *    "assetUid":"aeUTa3g2VzbPP5SGoTx8Rp",
 *    "assetName":"GEF_colectas_RG016",
 *    "recordId":1721,
 *    "name":"1721_1579374170278.jpg",
 *    "type":"image/jpeg",
 *    "size":4132284,
 *    "sizeMB":"4.13MB"
 *    }
 *  }
 * 
 * If there is no attachment map for an existing image, it will be
 * downloaded again.
 *
 * Up to date check:
 *    - Checks if attachment id in the map is equal to the current
 *      attachment id: if equals image is up to date.
 * 
 * Integrity check:
 *    - Checks if the hash in the map is equal to the hash of the
 *      image currently stored: if equals the image has integrity.
 */
```

