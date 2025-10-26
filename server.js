fetch(
  "https://ev.turnitin.com/paper/2791949490/similarity/overview/aggregate/source_glimpses?lang=en_us&cv=1&output=json&g=1&tl=0",
  {
    headers: {
      accept: "*/*",
      "accept-language": "en,bn;q=0.9",
      "content-type": "application/json",
      priority: "u=1, i",
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-palladium": "1",
      "x-requested-with": "XMLHttpRequest",
      "x-sproutcore-version": "1.11.0",
      cookie:
        "cwr_u=dc723ef4-e08c-4177-a965-140b6c5876af; OptanonAlertBoxClosed=2025-10-20T15:46:29.408Z; _hjSessionUser_6516729=eyJpZCI6ImU4M2M1MGRkLWEyNjktNTAxMy1hN2E3LTk5ZWVkMWYwYTljYiIsImNyZWF0ZWQiOjE3NjA5NzQ1NDAwMzAsImV4aXN0aW5nIjp0cnVlfQ==; __utmz=162339897.1760974605.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); _gcl_au=1.1.78599171.1760974538; _gid=GA1.2.1516659139.1761304362; _hjSessionUser_3901693=eyJpZCI6IjgyZmYzYmYzLTZjNTItNTI2My05MzVhLTRlZmY0ZTdmZjBiOSIsImNyZWF0ZWQiOjE3NjEzMDU1MTU3NTUsImV4aXN0aW5nIjp0cnVlfQ==; apt.uid=AP-H6XRJYUGEBGP-2-1761342124441-69161643.0.2.c428fb3e-3ea9-4d62-98bc-fbb947fc333c; __utma=6067303.912240596.1760974545.1761344593.1761344593.1; __utmz=6067303.1761344593.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); OptanonConsent=isIABGlobal=false&datestamp=Sat+Oct+25+2025+10%3A50%3A22+GMT%2B0600+(Bangladesh+Standard+Time)&version=6.24.0&hosts=&landingPath=NotLandingPage&groups=C0001%3A1%2CBG40%3A1%2CC0003%3A1%2CC0002%3A1%2CC0004%3A1&AwaitingReconsent=false&geolocation=BD%3BF; _ga_9ZQXFGJMFQ=GS2.1.s1761367823$o9$g0$t1761367823$j60$l0$h0; apt.sid=AP-H6XRJYUGEBGP-2-1761367827701-71185213; __utmc=162339897; legacy-session-id=8d7d64ab17504082aa2b9ae99a69a1b0; session-id=8d7d64ab17504082aa2b9ae99a69a1b0; __utma=162339897.912240596.1760974545.1761367845.1761371095.7; _ga_EJF27WH1D9=GS2.1.s1761371079$o7$g1$t1761371097$j42$l0$h0; _ga_HX5QNRS9GM=GS2.2.s1761371098$o7$g0$t1761371098$j60$l0$h0; _ga=GA1.2.912240596.1760974545; _gat=1; _ga_KQJGYCZ3D0=GS2.2.s1761368420$o3$g1$t1761373888$j60$l0$h0; cwr_s=eyJzZXNzaW9uSWQiOiI3YWRlMDc4Ny01YzJhLTQ4NmEtYWY1OS01ODE1NzA1YjQzOTgiLCJyZWNvcmQiOmZhbHNlLCJldmVudENvdW50Ijo1NTMsInBhZ2UiOnsicGFnZUlkIjoiL2FwcC9jYXJ0YS9lbl91cy8iLCJpbnRlcmFjdGlvbiI6MCwicmVmZXJyZXIiOiJodHRwczovL3d3dy50dXJuaXRpbi5jb20vIiwicmVmZXJyZXJEb21haW4iOiJ3d3cudHVybml0aW4uY29tIiwic3RhcnQiOjE3NjEzNjgzOTU3ODR9fQ==",
      Referer:
        "https://ev.turnitin.com/app/carta/en_us/?o=2791949490&s=1&lang=en_us&u=1149328974",
    },
    body: '{"source_id":"oid:3796:3647440686"}',
    method: "POST",
  }
)
  .then((res) => res.json())
  .then((res) => console.log(res));
