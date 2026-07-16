#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                let mut key = [0_u8; 32];
                argon2::Argon2::default()
                    .hash_password_into(
                        password.as_ref(),
                        b"silicon-nostalgia-stronghold-v1",
                        &mut key,
                    )
                    .expect("failed to derive Silicon Nostalgia stronghold key");
                key.to_vec()
            })
            .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running Silicon Nostalgia");
}
