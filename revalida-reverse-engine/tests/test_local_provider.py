import base64
import json
import unittest
from unittest.mock import patch

from pydantic import BaseModel

from src.classification.providers import OllamaClient, _json_from_model_text


class Result(BaseModel):
    nome: str


class FakeHTTPResponse:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.data).encode("utf-8")


class LocalProviderTests(unittest.TestCase):
    def test_removes_json_fence(self):
        self.assertEqual(_json_from_model_text('```json\n{"nome":"teste"}\n```'), '{"nome":"teste"}')

    def test_parses_structured_ollama_response(self):
        calls = []

        def fake_urlopen(request, timeout):
            calls.append((request, timeout))
            return FakeHTTPResponse({"message": {"content": '{"nome":"teste"}'}})

        client = OllamaClient(timeout=12)
        image = base64.b64encode(b"imagem").decode("ascii")
        with patch("src.classification.providers.urlopen", side_effect=fake_urlopen):
            response = client.responses.parse(
                model="modelo-local",
                instructions="Responda em português.",
                input=[{"role": "user", "content": [
                    {"type": "input_text", "text": "Classifique."},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{image}"},
                ]}],
                text_format=Result,
                store=False,
            )

        self.assertEqual(response.output_parsed.nome, "teste")
        payload = json.loads(calls[0][0].data.decode("utf-8"))
        self.assertFalse(payload["think"])
        self.assertEqual(payload["options"]["num_ctx"], 8192)
        self.assertEqual(payload["options"]["num_predict"], 1536)
        self.assertEqual(payload["messages"][1]["images"], [image])
        self.assertEqual(payload["format"]["properties"]["nome"]["maxLength"], 160)

    def test_full_exam_can_request_larger_local_context(self):
        calls = []

        def fake_urlopen(request, timeout):
            calls.append((request, timeout))
            return FakeHTTPResponse({"message": {"content": '{"nome":"teste"}'}})

        client = OllamaClient(
            num_ctx=32768,
            num_predict=4096,
            max_text_length=2500,
            max_list_items=8,
        )
        with patch("src.classification.providers.urlopen", side_effect=fake_urlopen):
            client.responses.parse(
                model="modelo-local",
                instructions="Responda em português.",
                input=[{"role": "user", "content": [{"type": "input_text", "text": "Crie."}]}],
                text_format=Result,
                store=False,
            )
        payload = json.loads(calls[0][0].data.decode("utf-8"))
        self.assertEqual(payload["options"]["num_ctx"], 32768)
        self.assertEqual(payload["options"]["num_predict"], 4096)
        self.assertEqual(payload["format"]["properties"]["nome"]["maxLength"], 2500)


if __name__ == "__main__":
    unittest.main()
