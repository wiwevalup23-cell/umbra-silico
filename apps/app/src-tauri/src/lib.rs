use serde::Deserialize;
use serde_json::Value as JsonValue;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SqlTransactionStatement {
    query: String,
    #[serde(default)]
    bind_values: Vec<JsonValue>,
}

#[tauri::command]
async fn execute_sqlite_transaction(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<SqlTransactionStatement>,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let db_pool = instances
        .get(&db)
        .ok_or_else(|| format!("Database not loaded: {db}"))?;
    let DbPool::Sqlite(pool) = db_pool;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    for statement in statements {
        let mut query = sqlx::query(&statement.query);

        for value in statement.bind_values {
            if value.is_null() {
                query = query.bind(None::<JsonValue>);
            } else if let Some(value) = value.as_str() {
                query = query.bind(value.to_owned());
            } else if let Some(value) = value.as_number() {
                query = query.bind(value.as_f64().unwrap_or_default());
            } else {
                query = query.bind(value);
            }
        }

        query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

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
                    .expect("failed to derive Umbra Silico stronghold key");
                key.to_vec()
            })
            .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![execute_sqlite_transaction])
        .run(tauri::generate_context!())
        .expect("error while running Umbra Silico");
}
