export default {
  /**
   * Token got with:
   * https://kobo.conabio.gob.mx/token/?format=json
   * 
   * Needed to authenticate kobo-api requests.
   */
  TOKEN: 'd3585b44a3ada6416be99818d4b4f4c0f2c7077f',
  // KoBo api server
  API_SERVER_URL: 'https://kobo.conabio.gob.mx/',
  // KoBo media server
  MEDIA_SERVER_URL: 'https://kcat.conabio.gob.mx/',
  // Timeouts
  REQUEST_TIMEOUT: 15000, //15s
  CONNECTION_TIMEOUT: 18000, //18s
  DOWNLOAD_TIMEOUT: 21000, //21s
  // Retries
  MAX_REQUEST_RETRIES: 20,
  MAX_DOWNLOAD_RETRIES: 30,
  // Output dir
  OUTPUT_DIR: 'output'
}
