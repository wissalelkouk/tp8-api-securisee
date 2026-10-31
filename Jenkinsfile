pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  environment {
    IMAGE_NAME = 'wissl/contact-api'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script { env.SHORT_SHA = env.GIT_COMMIT.take(7) }
        echo "Commit ${env.GIT_COMMIT} -> tag ${env.SHORT_SHA}"
      }
    }

    stage('Node') {
      agent {
        docker {
          image 'node:24-alpine'
          reuseNode true
          args '-e HOME=/tmp -e npm_config_cache=/tmp/.npm'
        }
      }
      stages {
        stage('Install') {
          steps { sh 'npm ci' }
        }
        stage('Quality') {
          parallel {
            stage('Lint') {
              steps { sh 'npm run lint' }
            }
            stage('Unit tests') {
              steps {
                sh 'npm test -- --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml'
              }
              post {
                always { junit allowEmptyResults: true, testResults: 'reports/junit.xml' }
              }
            }
          }
        }
      }
    }

    stage('Build image') {
      steps {
        sh '''
          docker build \
            --label org.opencontainers.image.revision="$GIT_COMMIT" \
            -t "$IMAGE_NAME:$SHORT_SHA" .
        '''
      }
    }

    stage('Push') {
      when {
        anyOf {
          branch 'main'
          expression { env.GIT_BRANCH == 'origin/main' }
        }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub',
                          usernameVariable: 'DH_USER', passwordVariable: 'DH_TOKEN')]) {
          sh 'echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin'
          sh 'docker push "$IMAGE_NAME:$SHORT_SHA"'
        }
        sh 'echo "$IMAGE_NAME:$SHORT_SHA" > image.txt'
        archiveArtifacts artifacts: 'image.txt', fingerprint: true
      }
      post {
        always { sh 'docker logout || true' }
      }
    }
  }

  post {
    success { echo "Build OK : ${env.IMAGE_NAME}:${env.SHORT_SHA}" }
    failure { echo 'Build en echec : consultez le stage rouge et l onglet Tests.' }
    cleanup { cleanWs() }
  }
}
