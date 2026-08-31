import os
import json
import sys
import unittest
from collections.abc import Mapping
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from aurel_crewai.guard import AurelCrewAIGuard, AurelCrewAIConfig, AurelToolBlockedError, protect_tool


class FakeGuard(AurelCrewAIGuard):
    def __init__(self, decisions):
        super().__init__(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        self.decisions = list(decisions)
        self.telemetry = []

    def _post_json(self, path, payload):
        if path.endswith("telemetry"):
            self.telemetry.append(payload)
            return {"accepted": True}
        return self.decisions.pop(0)


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self, _size):
        return self.body


class ThrowingMapping(Mapping):
    def __iter__(self):
        return iter(["token"])

    def __len__(self):
        return 1

    def __getitem__(self, key):
        raise RuntimeError("mapping access should not escape")


class ThrowingIteratorMapping(Mapping):
    def __iter__(self):
        raise RuntimeError("mapping iteration should not escape")

    def __len__(self):
        return 1

    def __getitem__(self, key):
        return "unreachable"


class CrewAITests(unittest.TestCase):
    def test_allows_callable(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        tool = protect_tool(lambda command: f"ran {command}", guard, name="terminal")
        self.assertEqual(tool("pwd"), "ran pwd")
        self.assertEqual(guard.telemetry[0]["outcome"]["status"], "success")

    def test_preserves_single_mapping_positional_callable_arguments(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        seen = []

        def structured_tool(payload):
            seen.append(payload)
            return payload["path"]

        tool = protect_tool(structured_tool, guard, name="read_file")
        self.assertEqual(tool({"path": "README.md"}), "README.md")
        self.assertEqual(seen, [{"path": "README.md"}])
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"path": "README.md"})

    def test_preserves_single_mapping_positional_basetool_arguments(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        seen = []

        class StructuredTool:
            name = "read_file"

            def _run(self, payload):
                seen.append(payload)
                return payload["path"]

        tool = protect_tool(StructuredTool(), guard)
        self.assertEqual(tool._run({"path": "README.md"}), "README.md")
        self.assertEqual(seen, [{"path": "README.md"}])
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"path": "README.md"})

    def test_blocks_before_execution(self):
        guard = FakeGuard([{"decision": "block", "traceId": "t", "riskScore": 95}])
        executed = False

        def dangerous(command):
            nonlocal executed
            executed = True
            return command

        tool = protect_tool(dangerous, guard, name="terminal")
        with self.assertRaises(AurelToolBlockedError):
            tool("rm -rf important-directory")
        self.assertFalse(executed)
        self.assertEqual(guard.telemetry[0]["outcome"]["status"], "blocked")
        self.assertEqual(guard.telemetry[0]["metadata"]["decision"], "block")
        self.assertEqual(guard.telemetry[0]["metadata"]["riskScore"], 95)

    def test_approval_required_reports_approval_requested_before_execution(self):
        guard = FakeGuard([{"decision": "require_approval", "traceId": "t", "riskScore": 72}])
        executed = False

        def send_email(to, token):
            nonlocal executed
            executed = True
            return to

        tool = protect_tool(send_email, guard, name="send_email")
        with self.assertRaises(AurelToolBlockedError):
            tool(to="finance@example.com", token="secret")
        self.assertFalse(executed)
        self.assertEqual(guard.telemetry[0]["outcome"]["status"], "approval_requested")
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"to": "finance@example.com", "token": "[REDACTED]"})
        self.assertEqual(guard.telemetry[0]["metadata"]["decision"], "require_approval")
        self.assertEqual(guard.telemetry[0]["metadata"]["riskScore"], 72)
        self.assertIsInstance(guard.telemetry[0]["timings"]["aurelPostflightLatencyMs"], int)

    def test_approval_handler_can_allow_execution(self):
        guard = FakeGuard([{"decision": "require_approval", "traceId": "t", "riskScore": 72}])
        guard.config = AurelCrewAIConfig(
            api_url="https://aurel.test",
            api_key="test",
            telemetry_async=False,
            approval_handler=lambda action, decision: action["action"]["name"] == "send_email" and decision["riskScore"] == 72,
        )

        tool = protect_tool(lambda to: f"sent {to}", guard, name="send_email")
        self.assertEqual(tool(to="finance@example.com"), "sent finance@example.com")
        self.assertEqual([entry["outcome"]["status"] for entry in guard.telemetry], ["approval_requested", "approval_allowed", "success"])

    def test_approval_handler_denial_blocks_before_execution(self):
        guard = FakeGuard([{"decision": "require_approval", "traceId": "t", "riskScore": 72}])
        guard.config = AurelCrewAIConfig(
            api_url="https://aurel.test",
            api_key="test",
            telemetry_async=False,
            approval_handler=lambda _action, _decision: False,
        )
        executed = False

        def send_email(to):
            nonlocal executed
            executed = True
            return to

        tool = protect_tool(send_email, guard, name="send_email")
        with self.assertRaises(AurelToolBlockedError):
            tool(to="finance@example.com")
        self.assertFalse(executed)
        self.assertEqual([entry["outcome"]["status"] for entry in guard.telemetry], ["approval_requested", "approval_denied"])

    def test_legacy_flag_decision_requires_approval(self):
        guard = FakeGuard([{"decision": "flag", "traceId": "t", "riskScore": 64}])
        tool = protect_tool(lambda to: to, guard, name="send_email")
        with self.assertRaises(AurelToolBlockedError):
            tool(to="finance@example.com")
        self.assertEqual(guard.telemetry[0]["outcome"]["status"], "approval_requested")
        self.assertEqual(guard.telemetry[0]["metadata"]["decision"], "require_approval")

    def test_rewrites_arguments(self):
        guard = FakeGuard([{"decision": "rewrite", "rewrittenArguments": {"command": "pwd"}, "traceId": "t"}])
        tool = protect_tool(lambda command: command, guard, name="terminal")
        self.assertEqual(tool("rewrite-me"), "pwd")
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"command": "pwd"})
        self.assertEqual(guard.telemetry[0]["metadata"]["originalArgs"], "rewrite-me")
        self.assertTrue(guard.telemetry[0]["metadata"]["rewriteApplied"])
        self.assertIsInstance(guard.telemetry[0]["timings"]["aurelPostflightLatencyMs"], int)

    def test_strips_query_and_fragment_from_aurel_url(self):
        seen = []

        def fake_urlopen(request, timeout):
            seen.append(request.full_url)
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test/base?token=secret#fragment", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            self.assertEqual(guard._post_json("/api/v1/actions/evaluate", {"ok": True})["decision"], "allow")
        self.assertEqual(seen[0], "https://aurel.test/base/api/v1/actions/evaluate")

    def test_sends_idempotency_keys(self):
        seen = []

        def fake_urlopen(request, timeout):
            seen.append((request.full_url, request.get_header("Idempotency-key")))
            return FakeResponse(b'{"decision":"allow"}' if request.full_url.endswith("/evaluate") else b'{"accepted":true}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json("/api/v1/actions/evaluate", {"version": "1", "action": {"id": "call/1", "name": "read", "arguments": {}}, "agent": {}, "timestamp": "now"})
            guard._post_json("/api/v1/actions/telemetry", {"version": "1", "actionId": "call/1", "outcome": {"status": "success"}, "timestamp": "now"})

        self.assertEqual(
            seen,
            [
                ("https://aurel.test/api/v1/actions/evaluate", "action-evaluate:call%2F1"),
                ("https://aurel.test/api/v1/actions/telemetry", "action-telemetry:call%2F1:success"),
            ],
        )

    def test_serializes_circular_action_arguments(self):
        seen = []
        args = {"command": "pwd"}
        args["self"] = args

        def fake_urlopen(request, timeout):
            seen.append(request.data.decode("utf-8"))
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json("/api/v1/actions/evaluate", {"version": "1", "action": {"id": "call-circular", "name": "terminal", "arguments": args}, "agent": {}, "timestamp": "now"})

        self.assertIs(args["self"], args)
        self.assertEqual(json.loads(seen[0])["action"]["arguments"], {"command": "pwd", "self": "[Circular]"})

    def test_preserves_repeated_non_circular_action_references(self):
        seen = []
        shared = {"path": "README.md"}

        def fake_urlopen(request, timeout):
            seen.append(request.data.decode("utf-8"))
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json(
                "/api/v1/actions/evaluate",
                {
                    "version": "1",
                    "action": {"id": "call-repeated-ref", "name": "read_file", "arguments": {"first": shared, "second": shared}},
                    "agent": {},
                    "timestamp": "now",
                },
            )

        self.assertEqual(json.loads(seen[0])["action"]["arguments"], {"first": {"path": "README.md"}, "second": {"path": "README.md"}})

    def test_serializes_throwing_mappings_as_inert_values(self):
        seen = []

        def fake_urlopen(request, timeout):
            seen.append(request.data.decode("utf-8"))
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json(
                "/api/v1/actions/evaluate",
                {"version": "1", "action": {"id": "call-throwing-mapping", "name": "terminal", "arguments": ThrowingMapping()}, "agent": {}, "timestamp": "now"},
            )

        self.assertEqual(json.loads(seen[0])["action"]["arguments"], {"token": "[UnserializableProperty]"})

    def test_serializes_throwing_mapping_iteration_as_inert_value(self):
        seen = []

        def fake_urlopen(request, timeout):
            seen.append(request.data.decode("utf-8"))
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json(
                "/api/v1/actions/evaluate",
                {"version": "1", "action": {"id": "call-throwing-iteration", "name": "terminal", "arguments": ThrowingIteratorMapping()}, "agent": {}, "timestamp": "now"},
            )

        self.assertEqual(json.loads(seen[0])["action"]["arguments"], "[UnserializableMapping]")

    def test_bounds_oversized_action_arguments(self):
        seen = []

        def fake_urlopen(request, timeout):
            seen.append(request.data)
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json(
                "/api/v1/actions/evaluate",
                {"version": "1", "action": {"id": "call-large", "name": "terminal", "arguments": {"command": "x" * (2 * 1024 * 1024)}}, "agent": {}, "timestamp": "now"},
            )

        self.assertLess(len(seen[0]), 1024 * 1024)
        self.assertIn("[truncated]", json.loads(seen[0].decode("utf-8"))["action"]["arguments"]["command"])

    def test_bounds_total_preflight_request_size_preserving_action_envelope(self):
        seen = []
        many_large_fields = {f"field_{index}": "x" * 65536 for index in range(64)}

        def fake_urlopen(request, timeout):
            seen.append(request.data)
            return FakeResponse(b'{"decision":"allow"}')

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            guard._post_json(
                "/api/v1/actions/evaluate",
                {"version": "1", "action": {"id": "call-total-bound", "name": "terminal", "arguments": many_large_fields}, "agent": {"id": "agent-1"}, "timestamp": "now"},
            )

        sent = json.loads(seen[0].decode("utf-8"))
        self.assertLess(len(seen[0]), 1024 * 1024)
        self.assertEqual(sent["action"]["id"], "call-total-bound")
        self.assertEqual(sent["action"]["name"], "terminal")
        self.assertEqual(sent["agent"], {"id": "agent-1"})
        self.assertEqual(sent["action"]["arguments"], {"truncated": True, "reason": "payload_limit"})

    def test_rejects_oversized_aurel_response(self):
        def fake_urlopen(request, timeout):
            return FakeResponse(b"x" * (1024 * 1024 + 1))

        guard = AurelCrewAIGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", telemetry_async=False))
        with patch("urllib.request.urlopen", fake_urlopen):
            with self.assertRaises(RuntimeError):
                guard._post_json("/api/v1/actions/evaluate", {"ok": True})

    def test_skips_aurel_internal_tools_to_avoid_recursion(self):
        guard = FakeGuard([{"decision": "block", "traceId": "t"}])
        tool = protect_tool(lambda event: f"sent {event}", guard, name="aurel.telemetry")
        self.assertEqual(tool(event="ok"), "sent ok")
        self.assertEqual(len(guard.decisions), 1)
        self.assertEqual(guard.telemetry, [])

    def test_disabled_guard_skips_aurel(self):
        guard = FakeGuard([{"decision": "block", "traceId": "t"}])
        guard.config = AurelCrewAIConfig(api_url="https://aurel.test", api_key="", enabled=False, telemetry_async=False)
        tool = protect_tool(lambda command: f"ran {command}", guard, name="terminal")
        self.assertEqual(tool("pwd"), "ran pwd")
        self.assertEqual(len(guard.decisions), 1)
        self.assertEqual(guard.telemetry, [])

    def test_tool_exclude_skips_aurel(self):
        guard = FakeGuard([{"decision": "block", "traceId": "t"}])
        guard.config = AurelCrewAIConfig(api_url="https://aurel.test", api_key="", tools_exclude=("terminal",), telemetry_async=False)
        tool = protect_tool(lambda command: f"ran {command}", guard, name="terminal")
        self.assertEqual(tool("pwd"), "ran pwd")
        self.assertEqual(len(guard.decisions), 1)
        self.assertEqual(guard.telemetry, [])

    def test_tool_include_limits_interception(self):
        guard = FakeGuard([{"decision": "block", "traceId": "t"}])
        guard.config = AurelCrewAIConfig(api_url="https://aurel.test", api_key="", tools_include=("send_email",), telemetry_async=False)
        tool = protect_tool(lambda command: f"ran {command}", guard, name="terminal")
        self.assertEqual(tool("pwd"), "ran pwd")
        self.assertEqual(len(guard.decisions), 1)
        self.assertEqual(guard.telemetry, [])

    def test_redacts_arguments_in_telemetry(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        tool = protect_tool(lambda authorization: "ok", guard, name="terminal")
        self.assertEqual(tool(authorization="Bearer secret"), "ok")
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"authorization": "[REDACTED]"})
        self.assertFalse(guard.telemetry[0]["metadata"]["resultIncluded"])

    def test_preserves_repeated_non_circular_references_in_telemetry_redaction(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        shared = {"path": "README.md"}
        tool = protect_tool(lambda **kwargs: kwargs, guard, name="read_file")
        self.assertEqual(tool(first=shared, second=shared), {"first": shared, "second": shared})
        self.assertEqual(guard.telemetry[0]["metadata"]["args"], {"first": {"path": "README.md"}, "second": {"path": "README.md"}})

    def test_can_include_redacted_results_when_configured(self):
        guard = FakeGuard([{"decision": "allow", "traceId": "t"}])
        guard.config = AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", include_results=True, telemetry_async=False)
        tool = protect_tool(lambda command: {"token": "secret", "ok": command}, guard, name="terminal")
        self.assertEqual(tool(command="pwd"), {"token": "secret", "ok": "pwd"})
        self.assertTrue(guard.telemetry[0]["metadata"]["resultIncluded"])
        self.assertEqual(guard.telemetry[0]["metadata"]["result"], {"token": "[REDACTED]", "ok": "pwd"})

    def test_malformed_decision_fails_closed_before_execution(self):
        guard = FakeGuard([{"notDecision": True}])
        executed = False

        def dangerous(command):
            nonlocal executed
            executed = True
            return command

        tool = protect_tool(dangerous, guard, name="terminal")
        with self.assertRaises(AurelToolBlockedError):
            tool(command="pwd")
        self.assertFalse(executed)

    def test_fail_open_blocks_privileged_actions_on_aurel_error_by_default(self):
        class FailingGuard(AurelCrewAIGuard):
            def _post_json(self, path, payload):
                raise RuntimeError("down")

        guard = FailingGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", fail_mode="open", telemetry_async=False))
        executed = False

        def terminal(command):
            nonlocal executed
            executed = True
            return command

        tool = protect_tool(terminal, guard, name="terminal")
        with self.assertRaises(AurelToolBlockedError):
            tool(command="pwd")
        self.assertFalse(executed)

    def test_fail_open_allows_low_risk_actions_on_aurel_error(self):
        class FailingGuard(AurelCrewAIGuard):
            def _post_json(self, path, payload):
                raise RuntimeError("down")

        guard = FailingGuard(AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", fail_mode="open", telemetry_async=False))
        tool = protect_tool(lambda path: path, guard, name="read_file")
        self.assertEqual(tool(path="README.md"), "README.md")

    def test_fail_open_can_explicitly_allow_privileged_actions_on_aurel_error(self):
        class FailingGuard(AurelCrewAIGuard):
            def _post_json(self, path, payload):
                raise RuntimeError("down")

        guard = FailingGuard(
            AurelCrewAIConfig(api_url="https://aurel.test", api_key="test", fail_mode="open", fail_open_privileged_actions="allow", telemetry_async=False)
        )
        tool = protect_tool(lambda command: command, guard, name="terminal")
        self.assertEqual(tool(command="pwd"), "pwd")

    def test_malformed_decision_metadata_fails_closed_before_execution(self):
        guard = FakeGuard([{"decision": "allow", "riskScore": 500, "ruleIds": "not-an-array"}])
        executed = False

        def dangerous(command):
            nonlocal executed
            executed = True
            return command

        tool = protect_tool(dangerous, guard, name="terminal")
        with self.assertRaises(AurelToolBlockedError):
            tool(command="pwd")
        self.assertFalse(executed)

    def test_non_finite_risk_score_fails_closed_before_execution(self):
        guard = FakeGuard([{"decision": "allow", "riskScore": float("nan")}])
        executed = False

        def dangerous(command):
            nonlocal executed
            executed = True
            return command

        tool = protect_tool(dangerous, guard, name="terminal")
        with self.assertRaises(AurelToolBlockedError):
            tool(command="pwd")
        self.assertFalse(executed)

    def test_invalid_timeout_env_uses_safe_default(self):
        original = os.environ.get("AUREL_TIMEOUT_MS")
        os.environ["AUREL_TIMEOUT_MS"] = "not-a-number"
        try:
            self.assertEqual(AurelCrewAIConfig().timeout_ms, 1500)
        finally:
            if original is None:
                os.environ.pop("AUREL_TIMEOUT_MS", None)
            else:
                os.environ["AUREL_TIMEOUT_MS"] = original


if __name__ == "__main__":
    unittest.main()
