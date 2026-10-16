// SPDX-License-Identifier: AGPL-3.0-or-later

use axum::{
    Json,
    http::header,
    response::{IntoResponse, Response},
};
use serde_json::json;

// pirichat: the iOS app (team PL952Y4644). Paths match the Android app's intent filter.
const APP_IDS: [&str; 2] = [
    "PL952Y4644.online.pirichat.mobile",
    "PL952Y4644.online.pirichat.mobile.canary",
];
const APP_LINK_PATHS: [&str; 8] = [
    "/channels/*",
    "/invite/*",
    "/gift/*",
    "/users/*",
    "/settings/user/*",
    "/reset/*",
    "/notifications/*",
    "/you/*",
];

pub async fn apple_app_site_association() -> Response {
    let components: Vec<_> = APP_LINK_PATHS
        .iter()
        .map(|path| json!({ "/": path }))
        .collect();
    let body = json!({
        "applinks": {
            "details": [{ "appIDs": APP_IDS, "components": components }]
        },
        "webcredentials": { "apps": APP_IDS }
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
    async fn association_lists_the_pirichat_app_for_links_and_credentials() {
        let response = apple_app_site_association().await;
        assert_eq!(response.status(), axum::http::StatusCode::OK);

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let actual: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(actual["webcredentials"]["apps"][0], "PL952Y4644.online.pirichat.mobile");
        let details = &actual["applinks"]["details"][0];
        assert_eq!(details["appIDs"][0], "PL952Y4644.online.pirichat.mobile");
        assert_eq!(details["components"][1]["/"], "/invite/*");
    }
}
