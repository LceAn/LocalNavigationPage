import subprocess

def run_command(command):
    """运行一个命令并返回其输出。"""
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"执行命令出错：{command}")
        print(result.stderr)
        return None
    return result.stdout

def git_update(commit_message):
    """添加、提交并推送更改到GitHub仓库。"""
    # Git 添加
    print("正在添加所有更改...")
    run_command("git add .")
    
    # Git 提交
    print(f"正在提交更改，提交信息：{commit_message}")
    run_command(f"git commit -m \"{commit_message}\"")
    
    # Git 推送
    print("正在推送更改到远程仓库...")
    run_command("git push")

if __name__ == "__main__":
    commit_message = input("请输入提交信息：")
    git_update(commit_message)