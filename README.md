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
# Clone this project from GitHub
git clone <git_project_url>
```
* As this proyect uses [node-canvas](https://github.com/Automattic/node-canvas) to get images information, you need to install some dependencies first. Below is the command you need to install dependencies on Ubuntu system, please refer to the section [Compiling](https://github.com/Automattic/node-canvas#compiling) of [node-canvas](https://github.com/Automattic/node-canvas) GitHub homepage to see details about other systems.

OS | Command
----- | -----
Ubuntu | `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

* To install this project:
```
npm install
```

## Basic configuration
You can provide a `run-configs.json` file with basic configuration parameters.

```json
{
  "apiServerUrl": "https://kobo.conabio.gob.mx/",
  "mediaServerUrl": "https://kcat.conabio.gob.mx/",
  "outputDir": "output",
  "deleteImages": false,
  "filters": [
    {
      "assetId": "<assetUid>",
      "submissionIdsCsv": "colectas.csv",
      "submissionIdsCsvIdColumnName": "id",
      "submissionIdsCsvSeparator": ","
    }
  ]
}
```
**Note:** If you put the configuration file in the predefined directory `run-configs`, then you can specify only the name (without path) when you run the script.

The following are required configurations:
* `apiServerUrl`: KoBo API server url.
* `mediaServerUrl`: KoBo media server url.
* `filters.assetId`: asset (form) id.

The following are optional configurations:
* `outputDir`: directory where images and other output will be saved. If you configure this option the directory should exists. (default: `"output"`).
* `deleteImages`: If `true`, images will be deleted instead of moved to `'images_deleted'` directory (default: `false`).
* `submissionIdsCsv`: csv file with an id column, where submissions ids should be. If not provided, all submissions will be included in the update process.
  * `submissionIdsCsvIdColumnName`: id column (default: `"id"`).
  * `submissionIdsCsvSeparator`: csv separator character (default: `","`).

## Usage
Execute the following command to start the image-update process over the configured assets.
```sh
# you can run it with node
node ./kobo-imgs-fs-updater.js -f run-configs.json

# or with npm
npm start -- -f run-configs.json
```

## Output results
At the end of the process, you will have the following output tree:
```console
output/
├── .attachments_map
│   └── <assetUid>
│       ├── 1721
│       └── 1723
├── images
│   └── <assetUid>
│       └── <assetName>
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
<assetUid>,GEF_colectas_RG016,1721,1721_1579374170278.jpg,4132284,4.13MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-240650581,1759009758,-738380866,-1252016960,-1117734626,-2098850447,-1669759583,1939428331]"
<assetUid>,GEF_colectas_RG016,1721,1721_1579374245054.jpg,7658307,7.66MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-2107362895,1501112355,-1378498611,-1090845309,522225366,-1172291672,-1116237041,-360917577]"
<assetUid>,GEF_colectas_RG016,1721,1721_1579374270078.jpg,4160413,4.16MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-1716067697,45361568,-1002483612,-1341406519,-58516787,-720829260,1974367655,-216617698]"
<assetUid>,GEF_colectas_RG016,1721,1721_1579374287914.jpg,7452144,7.45MB,image/jpeg,"width: 2976 pixels, height: 3968 pixels",2976,3968, "[-1089216671,-186613993,-1101340157,2106466214,64105590,123906609,-1979905858,2102977033]"
<assetUid>,GEF_colectas_RG016,1723,1723_1579374308256.jpg,6177655,6.18MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[1789314038,1095443034,-190271744,1038995168,-221165226,-1923081117,1783458859,539587516]"
<assetUid>,GEF_colectas_RG016,1723,1723_1579374347354.jpg,5909566,5.91MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[-2121826268,-2114841587,1269747967,-805584337,614506380,-1644648640,-1905631139,1750768959]"
<assetUid>,GEF_colectas_RG016,1723,1723_1579374392261.jpg,5699688,5.7MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[-359204658,-472504106,676645795,1864634546,1216755732,-802929860,1129053626,1445613292]"
<assetUid>,GEF_colectas_RG016,1723,1723_1579374430920.jpg,7431575,7.43MB,image/jpeg,"width: 3120 pixels, height: 4160 pixels",3120,4160, "[355624210,423644185,-1299040392,1733903363,-747128272,157906734,-94938422,-324057370]"
```
The `.attachments_map` is a hidden directory and contains information that allows the script to check for integrity and validity of the current images existing in the `output/images` directory, and is used when the script is ran over an existing `output` directory. The `runs` directory, contains a timestamped directory per each run of the script, with logs and track files corresponding to the task made by the script.

## Action maps
For each image-field of each submitted record, the script builds a map or object that has the following attributes:
```json
    [
      {
        "_id": 1721,
        "ImagenEjemplar1": {
          "value": "1579374170278.jpg",
          "attachment": {
            "mimetype": "image/jpeg",
            "download_url": "<download url>",
            "filename": "<filename>",
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
            "download_url": "<download url>",
            "filename": "<filename>",
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
            "download_url": "<download url>",
            "filename": "<filename>",
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
            "download_url": "<download url>",
            "filename": "<filename>",
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
In this case, each of the keys `ImagenEjemplar1`, ..., `ImagenEjemplar6` are image-fields and for each of them there is an `action` to be executed. The possible actions are:

action      | description
---         | ---
`keep`      | The image will be *downloaded* if not exists. If exists will be *kept*.
`delete`    | The image will be *cleaned* if exists.
`none`      | The image will be *moved* to `images_deleted` dir if exists.

Each `action` is determined as following:
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
 *    "assetUid":"<asset uid>",
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
## Cleanup stage
When the task that runs the action map start running, a sub-task is trigger asynchronously to check if there exists images in the `output/images` directory that are neither in the `keep` set nor in the `delete` set, and cleans all this images, either deleting them (if `deleteImages` is set to `true`) or moving them to `images_deleted` directory. Also all the images in the `none` set, if some exists, are cleaned by moving them to `images_deleted` directory.

## Operations mode
The script can run two operation modes: `filters` or `token`. In `filters` mode, the script will operates over the configurated assets and submissions specified in `filters` configuration. In `token` mode, the script will be run a discovery of the assets authorized by the token provided, and will operates over all submissions of these discovered assets; to enter `token` mode, you need to configurate the `token` parameter, for example:

```json
{
  "token": "KoBo token"
  "apiServerUrl": "https://kobo.conabio.gob.mx/",
  "mediaServerUrl": "https://kcat.conabio.gob.mx/",
  "outputDir": "output",
  "deleteImages": false,
}
```
You can configurate either `filters` or `token` but not both. Also, at least one of these arguments should be configurated.

## Program options
You can see all program options with the following command:

```sh
# with node
node ./kobo-imgs-fs-updater.js -h

# or with npm
npm start -- -h

```
You will get the following output:
```console
Usage: kobo-imgs-fs-updater [options]

KoBo image file-system updater.

Options:
  -f, --config-file <FILE>                       JSON file with run configs.
  -s, --api-server-url <URL>                     URL of the KoBo API server.
  -m, --media-server-url <URL>                   URL of the KoBo media server.
  -o, --output-dir <DIR>                         Directory where the run results will be stored
  -t, --token <TOKEN>                            KoBo authentication token.
  -d, --delete-images                            Remove images instead of the default behavior of moving them to the images_deleted dir.
  --max-request-retries <MAX_REQUEST_RETRIES>    Max request retries before cancel the process.
  --max-download-retries <MAX_DOWNLOAD_RETRIES>  Max download retries before cancel the process.
  --request-timeout <REQUEST_TIMEOUT>            Request timeout before trying again.
  --connection-timeout <CONETION_TIMEOUT>        Connection timeout before trying again.
  --download-timeout <DOWNLOAD_TIMEOUT>          Download timeout before trying again.
  -h, --help                                     output usage information

```

## Configuration options
Some configurations can be specified in several ways. The table below shows the different options. 

program option | environment variable | run-configs JSON | globals.js  
--- | --- | --- | ---
`--api-server-url` | `KT_API_SERVER_URL` | `apiServerUrl` | `API_SERVER_URL`
`--media-server-url` | `KT_MEDIA_SERVER_URL` | `mediaServerUrl` | `MEDIA_SERVER_URL`
`--output-dir` | `KT_OUTPUT_DIR` | `outputDir` | `OUTPUT_DIR`
`--token` | `KT_TOKEN` | `token` | `TOKEN`
`--delete-images` | `KT_DELETE_IMAGES` | `deleteImages` | `DELETE_IMAGES`
`--max-request-retries` | `KT_MAX_REQUEST_RETRIES` | `maxRequestRetries` | `MAX_REQUEST_RETRIES`
`--max-download-retries` | `KT_MAX_DOWNLOAD_RETRIES` | `maxDownloadRetries` | `MAX_DOWNLOAD_RETRIES`
`--request-timeout` | `KT_REQUEST_TIMEOUT` | `requestTimeout` | `REQUEST_TIMEOUT`
`--connection-timeout` | `KT_CONNECTION_TIMEOUT` | `connectionTimeout` | `CONNECTION_TIMEOUT`
`--download-timeout` | `KT_DOWNLOAD_TIMEOUT` | `downloadTimeout` | `DOWNLOAD_TIMEOUT`
`--config-file` | `n/a` | `n/a` | `n/a`
`n/a` | `n/a` | `filters.assetId` | `n/a`
`n/a` | `n/a` | `filters.submissionIds` | `n/a`
`n/a` | `n/a` | `filters.submissionIdsCsv` | `n/a`
`n/a` | `n/a` | `filters.submissionIdsCsvIdColumnName` | `n/a`
`n/a` | `n/a` | `filters.submissionIdsCsvSeparator` | `n/a`

* The `submissionIds` allows you to configure an array with submissions ids. If `submissionIdsCsv` is also configured, the final set of submissions ids will be the union of both options.

If some configuration is defined using several options, the following precedence will apply (from highest to lowest precedence):

1. command line options.
2. environment variables.
3. run-configs json file.
4. globals.js module.

## Steps
The program runs the following steps or tasks to get the results (in order of appearance).

step | descriptions | filters mode | token mode  
--- | --- | --- | ---
`get assets` | Get a list of assets authorized to the token provided. | n/a | yes
`get image fields` | Get the image fields of each asset. | yes | yes
`get submissions` | Get submissions of each asset. | yes | yes
`build action map` | Builds the action map for each submission. | yes | yes
`update images` | Execute action map and clean stage. | yes | yes


## 'runs' directory
The `runs` directory, will contains a timestamped directory for each of the runs executed, each of one with logs and operations track files. An example of the `runs` directory structure is the following:

```console
output/runs/
├── run_2020-11-19-00-05-20
│   ├── images_deleted
│   │   └── <assetId>
│   │       └── <assetName>
│   │           ├── 1726_1579380702914.jpg
│   │           ├── 1726_1579380738564.jpg
│   │           ├── 1726_1579380757848.jpg
│   │           ├── 1726_1579380787936.jpg
│   │           └── 1735_1579466268204.jpg
│   ├── logs
│   │   └── run.log
│   ├── run-configs.json
│   └── steps
│       ├── 1_get_image_fields
│       │   ├── 1-result.json
│       │   ├── data
│       │   │   └── <assetId>-asset-response-data.json
│       │   └── filters
│       │       └── <assetId>-asset-response-filters.json
│       ├── 2_get_submissions
│       │   ├── 2-result.json
│       │   ├── data
│       │   │   └── submission-response-data-<assetId>.json
│       │   └── filters
│       │       └── submission-response-filters-<assetId>.json
│       ├── 3_build_action_map
│       │   └── 3-result.json
│       └── 4_update_images
│           └── <assetId>-4-result.json
└── run_2020-11-19-00-06-10
    ├── images_deleted
    │   └── <assetId>
    │       └── <assetName>
    ├── logs
    │   └── run.log
    ├── run-configs.json
    └── steps
        ├── 1_get_image_fields
        │   ├── 1-result.json
        │   ├── data
        │   │   └── <assetId>-asset-response-data.json
        │   └── filters
        │       └── <assetId>-asset-response-filters.json
        ├── 2_get_submissions
        │   ├── 2-result.json
        │   ├── data
        │   │   └── submission-response-data-<assetId>.json
        │   └── filters
        │       └── submission-response-filters-<assetId>.json
        ├── 3_build_action_map
        │   └── 3-result.json
        └── 4_update_images
            └── <assetId>-4-result.json

```

step | descriptions | filters mode | token mode  
--- | --- | --- | ---
`images_deleted` | Contains cleaned images if the `deleteImage` option if `false`.
`logs` | Contains the `run.log` file, with console log outputs from the overall process.
`run-configs.json` | Contains the run configurations with which the run was made.
`steps` | Contains the results of each step executed.
`steps/data` | Raw results before apply filters.
`steps/filters` | Filters applied to raw results.
`#-result.json` | Final result of the step.