from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class SessionSerializer(serializers.Serializer):
    user = UserSerializer(allow_null=True)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    # DRF trims by default, which would change a password that starts or ends
    # with a space.
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        # One error for an unknown username, a wrong password and a deactivated
        # user, so the answer doesn't reveal which usernames exist.
        user = authenticate(
            self.context["request"],
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(
                "Invalid username or password.", code="authorization"
            )
        attrs["user"] = user
        return attrs
