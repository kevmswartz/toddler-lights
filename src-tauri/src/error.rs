use std::io;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum BridgeError {
    #[error("Invalid request: {0}")]
    Invalid(String),
    #[error("Network error: {0}")]
    Network(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Unsupported on this platform")]
    Unsupported,
}

pub type BridgeResult<T> = Result<T, BridgeError>;

impl From<reqwest::Error> for BridgeError {
    fn from(value: reqwest::Error) -> Self {
        if value.is_timeout() {
            Self::Network("Request timed out".into())
        } else if value.is_decode() {
            Self::Network(format!("Failed to decode response: {value}"))
        } else {
            Self::Network(value.to_string())
        }
    }
}

impl From<io::Error> for BridgeError {
    fn from(value: io::Error) -> Self {
        Self::Io(value.to_string())
    }
}
