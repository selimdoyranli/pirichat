// SPDX-License-Identifier: AGPL-3.0-or-later

use axum::{
    Json,
    http::header,
    response::{IntoResponse, Response},
};
use serde_json::json;

// pirichat: the Android app. Fingerprints: Play app signing key, then the upload key (sideloaded builds).
const PACKAGES: [&str; 2] = ["online.pirichat.mobile", "online.pirichat.mobile.canary"];
const CERT_FINGERPRINTS: [&str; 2] = [
    "09:54:7D:A0:27:82:B8:F9:98:A0:B2:14:0F:56:6F:12:63:2A:4D:83:52:5F:B5:FD:9E:1A:E0:BE:18:7F:03:1A",
    "E8:D7:21:47:5F:08:27:2E:7E:9E:E2:F2:F1:B5:12:BF:2B:2A:07:EE:98:E0:CB:8F:2C:35:60:C4:40:09:70:B9",
];

pub async fn assetlinks() -> Response {
    let body = PACKAGES.map(|package_name| {
        json!({
            "relation": [
                "delegate_permission/common.handle_all_urls",
                "delegate_permission/common.get_login_creds"
            ],
            "target": {
                "namespace": "android_app",
                "package_name": package_name,
                "sha256_cert_fingerprints": CERT_FINGERPRINTS
            }
        })
    });

    (
        [(header::CACHE_CONTROL, "public, max-age=1800")],
        Json(body),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    #[tokio::test]
    async fn assetlinks_serves_android_login_credentials_association() {
        let response = assetlinks().await;

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=1800"
        );

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let actual: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let entries = actual.as_array().unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["target"]["package_name"], "online.pirichat.mobile");
        assert_eq!(entries[1]["target"]["package_name"], "online.pirichat.mobile.canary");
        assert_eq!(
            entries[0]["relation"],
            serde_json::json!([
                "delegate_permission/common.handle_all_urls",
                "delegate_permission/common.get_login_creds"
            ])
        );
        assert_eq!(entries[0]["target"]["sha256_cert_fingerprints"], serde_json::json!(CERT_FINGERPRINTS));
    }
}
